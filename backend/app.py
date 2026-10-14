from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import assessment, appointments, chat, stats

app = FastAPI(
    title="CKD Screening API",
    description="Preliminary CKD risk screening tool. Not a diagnostic device.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assessment.router, prefix="/api")
app.include_router(appointments.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(stats.router, prefix="/api")


@app.get("/")
def health_check():
    return {"status": "ok", "service": "ckd-screening-api"}
