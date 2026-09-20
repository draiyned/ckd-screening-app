"""
Appointment request endpoint for higher-risk users who want to connect
with a partnered healthcare provider.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from database import get_client

router = APIRouter()


class AppointmentRequest(BaseModel):
    assessment_id: Optional[str] = None
    name: str
    email: str
    phone: Optional[str] = None
    preferred_provider: Optional[str] = None


@router.post("/appointments")
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
        raise HTTPException(
            status_code=503, detail=f"Could not save appointment request: {e}"
        )

    return {
        "appointment_id": appointment_id,
        "status": "pending",
        "message": "Your appointment request has been received. A provider will follow up by email.",
    }


@router.get("/appointments/{appointment_id}")
def get_appointment(appointment_id: str):
    try:
        client = get_client()
        response = (
            client.table("appointments")
            .select("*")
            .eq("id", appointment_id)
            .single()
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Appointment not found: {e}")

    return response.data
