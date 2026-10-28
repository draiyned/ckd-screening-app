from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from model.combined_risk import assess
from database import get_client
from ratelimit import limit

router = APIRouter()

INTERVENTIONS = {
    "low": "Your risk appears low. Keep up healthy habits: stay hydrated, manage blood pressure, and get a routine checkup once a year.",
    "moderate": "Your risk is moderate. Consider scheduling a checkup with a doctor soon to review your blood pressure, blood sugar, and kidney function.",
    "high": "Your risk is high. Please schedule a checkup with a healthcare professional as soon as possible for proper testing and evaluation.",
}


class AssessmentInput(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = Field(None, max_length=254)
    address: Optional[str] = Field(None, max_length=200)
    age: Optional[float] = Field(None, ge=0, le=120)
    sex: Optional[str] = Field(None, max_length=20)
    blood_type: Optional[str] = Field(None, max_length=3)
    last_checkup: Optional[str] = Field(None, max_length=10)

    bp_systolic: Optional[float] = Field(None, ge=40, le=300)
    bp_diastolic: Optional[float] = Field(None, ge=20, le=200)
    weight: Optional[float] = Field(None, ge=1, le=500)
    last_meal: Optional[str] = Field(None, max_length=200)

    swelling: Optional[bool] = None
    fatigue: Optional[bool] = None
    urination_changes: Optional[bool] = None
    nausea: Optional[bool] = None
    other_symptoms: Optional[bool] = None
    other_symptoms_note: Optional[str] = Field(None, max_length=300)

    hypertension: Optional[bool] = None
    diabetes: Optional[bool] = None
    previous_kidney_problems: Optional[bool] = None
    other_conditions: Optional[bool] = None
    other_conditions_note: Optional[str] = Field(None, max_length=300)

    family_history_kidney_disease: Optional[bool] = None

    smoking_status: Optional[str] = Field(None, max_length=20)
    alcohol_use: Optional[bool] = None
    poor_diet: Optional[bool] = None
    low_physical_activity: Optional[bool] = None
    medication_use: Optional[bool] = None
    medication_use_note: Optional[str] = Field(None, max_length=300)

    serum_creatinine: Optional[float] = Field(None, ge=0, le=50)
    bun: Optional[float] = Field(None, ge=0, le=500)
    urine_protein_albumin: Optional[bool] = None
    blood_glucose: Optional[float] = Field(None, ge=0, le=2000)
    egfr: Optional[float] = Field(None, ge=0, le=200)


@router.post("/assessment", dependencies=[Depends(limit("assessment", 60, 3600))])
def run_assessment(payload: AssessmentInput):
    input_dict = payload.model_dump(exclude={"name", "email", "address"})

    result = assess(input_dict)

    record = {
        "name": payload.name,
        "email": payload.email,
        "age": int(round(payload.age)) if payload.age is not None else None,
        "inputs": {**input_dict, "address": payload.address},
        "combined_score": result["combined_score"],
        "risk_level": result["risk_level"],
        "model_probability": result["model_probability"],
        "rule_based_score": result["rule_based_score"],
    }

    try:
        client = get_client()
        response = client.table("assessments").insert(record).execute()
        assessment_id = response.data[0]["id"] if response.data else None
    except Exception as e:
        # Log the error type only. Never log the person's answers.
        print("assessment not saved:", type(e).__name__, str(e)[:200])
        assessment_id = None

    return {
        "assessment_id": assessment_id,
        "risk_level": result["risk_level"],
        "combined_score": result["combined_score"],
        "model_available": result["model_available"],
        "suggested_intervention": INTERVENTIONS.get(result["risk_level"], ""),
        "disclaimer": (
            "This is a preliminary screening result, not a medical diagnosis. "
            "Consult a healthcare professional for evaluation."
        ),
    }
