"""
CKD Screening Platform - API entry point.

Run locally:
    uvicorn app:app --reload

Endpoints:
    POST /api/assessment    - submit symptoms/health data, get risk level
    POST /api/appointments  - request a follow-up appointment
    GET  /api/appointments/{id} - check appointment status
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import assessment, appointments

app = FastAPI(
    title="CKD Screening API",
    description="Preliminary CKD risk screening tool. Not a diagnostic device.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restrict to your frontend domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assessment.router, prefix="/api")
app.include_router(appointments.router, prefix="/api")


@app.get("/")
def health_check():
    return {"status": "ok", "service": "ckd-screening-api"}
