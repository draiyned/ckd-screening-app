from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import assessment, appointments, chat, stats

# The interactive docs pages are switched off so visitors do not get a map of the API.
app = FastAPI(
    title="CKD Screening API",
    description="Preliminary CKD risk screening tool. Not a diagnostic device.",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    return response


app.include_router(assessment.router, prefix="/api")
app.include_router(appointments.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(stats.router, prefix="/api")


@app.get("/")
def health_check():
    return {"status": "ok", "service": "ckd-screening-api"}
