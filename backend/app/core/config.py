from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    ENVIRONMENT: str = Field(default="development", alias="NODE_ENV")
    PORT: int = Field(default=8000)
    HOST: str = Field(default="0.0.0.0")

    # PostgreSQL Database
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://ledger_app:ledger_app_secure_pass@localhost:9527/ledger_ae_test"
    )
    TEST_DATABASE_URL: str | None = None

    # Security & Cryptography (OWASP ASVS L2)
    JWT_SECRET: str = Field(default="01234567890123456789012345678901")
    TOTP_ENCRYPTION_KEY: str = Field(default="01234567890123456789012345678901")
    SESSION_TTL_SECONDS: int = Field(default=28800)  # 8 hours

    # Multi-Model LLM Gateway (LiteLLM)
    ANTHROPIC_API_KEY: str | None = None
    ANTHROPIC_MODEL_ID: str = Field(default="claude-3-7-sonnet-20250219")
    OPENAI_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    LITELLM_DEFAULT_MODEL: str = Field(default="anthropic/claude-3-5-sonnet-20241022")
    LITELLM_FALLBACK_MODELS: list[str] = Field(default=["openai/gpt-4o", "gemini/gemini-1.5-pro"])
    LITELLM_MAX_RETRIES: int = Field(default=2)
    LITELLM_TIMEOUT: float = Field(default=30.0)

    # UAE E-Invoicing & Open Banking
    ASP_PROVIDER_ID: str = Field(default="PINT_AE_SANDBOX")
    ASP_API_URL: str = Field(default="https://sandbox.asp.uae-einvoicing.ae/v1")
    ASP_CLIENT_ID: str | None = None
    ASP_CLIENT_SECRET: str | None = None
    BANK_AGGREGATOR_PROVIDER: str = Field(default="LEAN_TECHNOLOGIES")
    BANK_AGGREGATOR_API_KEY: str | None = None

    @field_validator("JWT_SECRET")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError(
                "JWT_SECRET must be at least 32 characters long for cryptographic security."
            )
        return v

    @field_validator("TOTP_ENCRYPTION_KEY")
    @classmethod
    def validate_totp_key(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("TOTP_ENCRYPTION_KEY must be at least 32 characters long.")
        return v

    @property
    def sync_database_url(self) -> str:
        """Returns standard synchronous psycopg2 connection string for migrations/scripts."""
        url = self.DATABASE_URL
        if url.startswith("postgresql+asyncpg://"):
            return url.replace("postgresql+asyncpg://", "postgresql://")
        return url


settings = Settings()
