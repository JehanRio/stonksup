from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.__about__ import __version__


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="STONKSUP_",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "StonksUp API"
    app_version: str = __version__
    environment: Literal["development", "test", "staging", "production"] = "development"
    api_v1_prefix: str = "/api/v1"
    log_level: str = "INFO"
    build_sha: str = "local"
    database_url: str | None = None
    market_data_provider: Literal["twelvedata"] = "twelvedata"
    twelve_data_api_key: SecretStr | None = None
    market_data_timeout_seconds: float = Field(default=12, gt=0, le=60)
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:4175",
            "http://localhost:3000",
        ]
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
