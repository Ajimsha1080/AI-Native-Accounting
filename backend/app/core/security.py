import base64
import os
import time
from typing import Any

import jwt
import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings
from app.core.exceptions import AuthException

# Argon2id password hasher with ASVS L2 recommended parameters
pwd_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MB
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """Hash password using Argon2id."""
    return pwd_hasher.hash(password)


def _normalize_argon2_hash(h: str) -> str:
    """Normalize Argon2 parameter order to canonical RFC 9106 order (m, t, p)."""
    if not h or not h.startswith("$argon2"):
        return h
    parts = h.split("$")
    if len(parts) >= 6 and "," in parts[3]:
        params = dict(kv.split("=") for kv in parts[3].split(",") if "=" in kv)
        if "m" in params and "t" in params and "p" in params:
            ordered_params = f"m={params['m']},t={params['t']},p={params['p']}"
            return f"${parts[1]}${parts[2]}${ordered_params}${parts[4]}${parts[5]}"
    return h


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against Argon2id hash."""
    try:
        normalized = _normalize_argon2_hash(hashed_password)
        return pwd_hasher.verify(normalized, plain_password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def _get_aes_gcm_key() -> bytes:
    """Derives 32-byte key for AES-256-GCM from TOTP_ENCRYPTION_KEY."""
    key_str = settings.TOTP_ENCRYPTION_KEY
    if len(key_str) >= 32:
        return key_str[:32].encode("utf-8")
    return key_str.ljust(32, "0").encode("utf-8")


def encrypt_totp_secret(plaintext_secret: str) -> str:
    """Encrypt TOTP secret using AES-256-GCM in standard hex-colon format (iv:tag:ct)."""
    key = _get_aes_gcm_key()
    aesgcm = AESGCM(key)
    iv = os.urandom(12)
    ciphertext_and_tag = aesgcm.encrypt(iv, plaintext_secret.encode("utf-8"), None)
    ct = ciphertext_and_tag[:-16]
    tag = ciphertext_and_tag[-16:]
    return f"{iv.hex()}:{tag.hex()}:{ct.hex()}"


def decrypt_totp_secret(encrypted_secret_b64: str) -> str:
    """Decrypt TOTP secret using AES-256-GCM, supporting both hex-colon and base64 packed formats."""
    try:
        key = _get_aes_gcm_key()
        aesgcm = AESGCM(key)
        if ":" in encrypted_secret_b64:
            parts = encrypted_secret_b64.split(":")
            if len(parts) == 3:
                iv = bytes.fromhex(parts[0])
                tag = bytes.fromhex(parts[1])
                ct = bytes.fromhex(parts[2])
                decrypted = aesgcm.decrypt(iv, ct + tag, None)
                return decrypted.decode("utf-8")
        raw = base64.b64decode(encrypted_secret_b64)
        iv = raw[:12]
        ciphertext = raw[12:]
        decrypted = aesgcm.decrypt(iv, ciphertext, None)
        return decrypted.decode("utf-8")
    except Exception as e:
        raise AuthException(f"Failed to decrypt TOTP secret: {e!s}", code="TOTP_DECRYPTION_FAILED")


def verify_totp_code(secret: str, code: str, window: int = 1) -> bool:
    """Verifies a 6-digit TOTP code against the secret with standard RFC 6238 drift window."""
    totp = pyotp.TOTP(secret)
    return totp.verify(code.strip(), valid_window=window)


def create_session_jwt(
    user_id: str, tenant_id: str, email: str, role: str, expires_delta_seconds: int | None = None
) -> str:
    """Creates a signed HMAC-SHA256 JWT containing authenticated user context."""
    ttl = expires_delta_seconds or settings.SESSION_TTL_SECONDS
    now = int(time.time())
    payload = {
        "jti": os.urandom(16).hex(),
        "sub": user_id,
        "tenant_id": tenant_id,
        "email": email,
        "role": role,
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


_revoked_session_tokens: set[str] = set()


def revoke_session_token(token: str) -> None:
    """Marks a session token as revoked in-memory."""
    _revoked_session_tokens.add(token)


def is_session_revoked(token: str) -> bool:
    """Checks whether a token has been revoked in-memory."""
    return token in _revoked_session_tokens


def verify_session_jwt(token: str) -> dict[str, Any]:
    """Verifies a JWT session token and returns decoded claims."""
    if is_session_revoked(token):
        raise AuthException("Session has been revoked. Please log in again.", code="SESSION_REVOKED")

    parts = token.split(".")
    if len(parts) == 2:
        import base64
        import hashlib
        import hmac
        import json

        data_b64, sig_b64 = parts
        expected_sig = hmac.new(settings.JWT_SECRET.encode(), data_b64.encode(), hashlib.sha256).digest()
        padded_sig = sig_b64 + "=" * (-len(sig_b64) % 4)
        try:
            provided_sig = base64.urlsafe_b64decode(padded_sig)
            if not hmac.compare_digest(provided_sig, expected_sig):
                raise AuthException("Invalid signature on session token", code="INVALID_SIGNATURE")
            padded_data = data_b64 + "=" * (-len(data_b64) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded_data).decode("utf-8"))
            exp_ms = payload.get("expiresAt") or (payload.get("exp") * 1000 if payload.get("exp") else None)
            if exp_ms and time.time() * 1000 > exp_ms:
                raise AuthException("Session has expired. Please log in again.", code="SESSION_EXPIRED")
            if "userId" in payload and "sub" not in payload:
                payload["sub"] = payload["userId"]
            if "tenantId" in payload and "tenant_id" not in payload:
                payload["tenant_id"] = payload["tenantId"]
            return payload
        except AuthException:
            raise
        except Exception as e:
            raise AuthException(f"Invalid authentication token: {e!s}", code="INVALID_TOKEN")

    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise AuthException("Session has expired. Please log in again.", code="SESSION_EXPIRED")
    except jwt.InvalidTokenError as e:
        raise AuthException(f"Invalid authentication token: {e!s}", code="INVALID_TOKEN")
