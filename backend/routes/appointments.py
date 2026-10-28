"""
Appointment request endpoint for higher-risk users who want to connect
with a partnered healthcare provider.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from database import get_client
from ratelimit import limit

router = APIRouter()


class AppointmentRequest(BaseModel):
    assessment_id: Optional[str] = Field(None, max_length=64)
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=3, max_length=254)
    phone: Optional[str] = Field(None, max_length=40)
    preferred_provider: Optional[str] = Field(None, max_length=300)


@router.post("/appointments", dependencies=[Depends(limit("appointments", 15, 3600))])
def request_appointment(payload: AppointmentRequest):
    record = payload.model_dump()
    record["status"] = "pending"

    try:
        client = get_client()
        response = client.table("appointments").insert(record).execute()

        if payload.assessment_id:
            client.table("assessments").update(
                {"appointment_requested": True}
            ).eq("id", payload.assessment_id).execute()

        appointment_id = response.data[0]["id"] if response.data else None
    except Exception as e:
        print("appointment not saved:", type(e).__name__, str(e)[:200])
        raise HTTPException(
            status_code=503, detail="Could not save your appointment request. Please try again."
        )

    return {
        "appointment_id": appointment_id,
        "status": "pending",
        "message": "Your request was saved on this platform. Please also contact the dialysis center yourself to confirm an appointment.",
    }
