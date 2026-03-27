from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

class Settings(BaseSettings):
    DATABASE_URL: str
    SUPABASE_JWT_SECRET: str
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    FRONTEND_URL: Optional[str] = None
    BILLING_CREDITOR_NAME: Optional[str] = None
    BILLING_CREDITOR_IBAN: Optional[str] = None
    BILLING_CREDITOR_ADDRESS: Optional[str] = None
    # Structured address for Swiss QR Bill compliance
    BILLING_CREDITOR_STREET: Optional[str] = None
    BILLING_CREDITOR_HOUSE_NUM: Optional[str] = None
    BILLING_CREDITOR_POSTAL_CODE: Optional[str] = None
    BILLING_CREDITOR_CITY: Optional[str] = None
    BILLING_CREDITOR_COUNTRY: str = "CH"
    BILLING_PAYMENT_MESSAGE: Optional[str] = None
    CO2_G_PER_KM: float = 93.6
    RETURN_TRIP_MULTIPLIER: float = 2.0
    OSRM_BASE_URL: str = "https://router.project-osrm.org"
    OSRM_TIMEOUT_SECONDS: int = 8
    DEFAULT_USER_PASSWORD: Optional[str] = None
    SENTRY_DSN: Optional[str] = None
    SENTRY_TRACES_SAMPLE_RATE: float = 0.0
    DEFAULT_VAT_RATE: float = 0.081

    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://172.18.160.1:3000",
        "https://staging.dringdring.me",
        "https://dringdring.me",
    ]
    CORS_ORIGINS_STR: Optional[str] = None
    # Keep DringDring domains always authorized even if CORS_ORIGINS_STR is partial on staging.
    CORS_ALLOW_ORIGIN_REGEX: str = r"^https://([a-z0-9-]+\.)?dringdring\.me$"
    API_V1_STR: str = "/api/v1"

    class Config:
        env_file = str(ENV_PATH)
        extra = "ignore"

settings = Settings()


def get_cors_origins() -> list[str]:
    # Merge configured list with defaults instead of replacing them.
    origins = set(settings.CORS_ORIGINS)
    if settings.CORS_ORIGINS_STR:
        origins.update(
            origin.strip()
            for origin in settings.CORS_ORIGINS_STR.split(",")
            if origin.strip()
        )
    return sorted(origins)
