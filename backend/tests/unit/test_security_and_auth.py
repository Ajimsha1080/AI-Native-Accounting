import pyotp

from app.core.security import (
    create_session_jwt,
    decrypt_totp_secret,
    encrypt_totp_secret,
    hash_password,
    verify_password,
    verify_session_jwt,
    verify_totp_code,
)


def test_argon2id_password_hashing():
    password = "SecureAccountingPassword@2026!"
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_aes_gcm_totp_secret_encryption():
    secret = pyotp.random_base32()
    encrypted = encrypt_totp_secret(secret)
    assert encrypted != secret
    decrypted = decrypt_totp_secret(encrypted)
    assert decrypted == secret


def test_rfc6238_totp_verification():
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    valid_code = totp.now()
    assert verify_totp_code(secret, valid_code) is True
    assert verify_totp_code(secret, "000000") is False


def test_jwt_session_issuance_and_claims():
    token = create_session_jwt(
        user_id="user-123",
        tenant_id="tenant-456",
        email="cfo@alnoor.ae",
        role="cfo",
        expires_delta_seconds=3600,
    )
    claims = verify_session_jwt(token)
    assert claims["sub"] == "user-123"
    assert claims["tenant_id"] == "tenant-456"
    assert claims["email"] == "cfo@alnoor.ae"
    assert claims["role"] == "cfo"
