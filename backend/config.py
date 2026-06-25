from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080  # 7 days

    # Google OAuth
    google_client_id: str = ""

    # CORS
    frontend_url: str = "http://localhost:3000"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    # Email — Resend API (Option B)
    resend_api_key: str = ""
    smtp_from_name: str = "LingoGen"
    smtp_from_email: str = "noreply@lingogen.me"


@lru_cache
def get_settings() -> Settings:
    return Settings()
