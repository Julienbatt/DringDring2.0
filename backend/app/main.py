import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.routes import (
    health,
    deliveries,
    pricing,
    reporting,
    me,
    clients,
    shops,
    billing,
    regions,
    couriers,
    cities,
    dispatch,
    tariffs,
    users,
    stats,
    settings as settings_router,
)

from app.core.config import settings as app_settings, get_cors_origins

app = FastAPI(title="DringDring Backend")
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_origin_regex=app_settings.CORS_ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.on_event("startup")
def startup_checks():
    if not app_settings.FRONTEND_URL:
        logger.warning(
            "FRONTEND_URL is not set. Supabase invites may default to Site URL (often localhost on staging if misconfigured)."
        )
    if app_settings.FRONTEND_URL and not app_settings.FRONTEND_URL.startswith("https://"):
        logger.warning("FRONTEND_URL should use https in staging/prod: %s", app_settings.FRONTEND_URL)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

app.include_router(health.router, prefix="/api/v1")
app.include_router(deliveries.router, prefix="/api/v1")
app.include_router(pricing.router, prefix="/api/v1")
app.include_router(reporting.router, prefix="/api/v1")
app.include_router(me.router, prefix="/api/v1")
app.include_router(clients.router, prefix="/api/v1")
app.include_router(shops.router, prefix="/api/v1")
app.include_router(billing.router, prefix="/api/v1")
app.include_router(regions.router, prefix="/api/v1")
app.include_router(couriers.router, prefix="/api/v1")
app.include_router(cities.router, prefix="/api/v1")
app.include_router(dispatch.router, prefix="/api/v1")
app.include_router(tariffs.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(stats.router, prefix="/api/v1")
app.include_router(settings_router.router, prefix="/api/v1")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
