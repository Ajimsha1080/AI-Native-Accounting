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


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against Argon2id hash."""
    try:
        return pwd_hasher.verify(hashed_password, plain_password)
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
    """Encrypt TOTP secret using AES-256-GCM with a random 12-byte IV."""
    key = _get_aes_gcm_key()
    aesgcm = AESGCM(key)
    iv = os.urandom(12)
    ciphertext = aesgcm.encrypt(iv, plaintext_secret.encode("utf-8"), None)
    # Pack IV + ciphertext into base64
    packed = iv + ciphertext
    return base64.b64encode(packed).decode("utf-8")


def decrypt_totp_secret(encrypted_secret_b64: str) -> str:
    """Decrypt TOTP secret using AES-256-GCM."""
    try:
        key = _get_aes_gcm_key()
        aesgcm = AESGCM(key)
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
        "sub": user_id,
        "tenant_id": tenant_id,
        "email": email,
        "role": role,
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_session_jwt(token: str) -> dict[str, Any]:
    """Verifies a JWT session token and returns decoded claims."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise AuthException("Session has expired. Please log in again.", code="SESSION_EXPIRED")
    except jwt.InvalidTokenError as e:
        raise AuthException(f"Invalid authentication token: {e!s}", code="INVALID_TOKEN")
