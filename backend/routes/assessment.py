"""
Assessment endpoint: takes user symptom/health inputs, runs the combined
risk assessment (ML model + rule-based scoring), stores the result, and
returns the risk level.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from model.combined_risk import assess
from database import get_client

router = APIRouter()


class AssessmentInput(BaseModel):
    # Basic info
    name: Optional[str] = None
    email: Optional[str] = None
    age: Optional[float] = None
    sex: Optional[str] = None  # male/female/other

    # Vital signs
    bp_systolic: Optional[float] = None
    bp_diastolic: Optional[float] = None
    weight: Optional[float] = None   # kg

    # Symptoms
    swelling: Optional[bool] = None
    fatigue: Optional[bool] = None
    urination_changes: Optional[bool] = None
    nausea: Optional[bool] = None
    other_symptoms: Optional[bool] = None
    other_symptoms_note: Optional[str] = None

    # Medical history
    hypertension: Optional[bool] = None
    diabetes: Optional[bool] = None
    previous_kidney_problems: Optional[bool] = None
    other_conditions: Optional[bool] = None
    other_conditions_note: Optional[str] = None

    # Family history
    family_history_kidney_disease: Optional[bool] = None

    # Lifestyle and risk factors
    smoking: Optional[bool] = None
    alcohol_use: Optional[bool] = None
    poor_diet: Optional[bool] = None
    low_physical_activity: Optional[bool] = None
    medication_use: Optional[bool] = None
    medication_use_note: Optional[str] = None

    # Optional laboratory results
    serum_creatinine: Optional[float] = None
    bun: Optional[float] = None
    urine_protein_albumin: Optional[bool] = None
    blood_glucose: Optional[float] = None


@router.post("/assessment")
def run_assessment(payload: AssessmentInput):
    input_dict = payload.model_dump(exclude={"name", "email"})

    result = assess(input_dict)

    record = {
        "name": payload.name,
        "email": payload.email,
        "age": payload.age,
        "inputs": input_dict,
        "combined_score": result["combined_score"],
        "risk_level": result["risk_level"],
        "model_probability": result["model_probability"],
        "rule_based_score": result["rule_based_score"],
    }

    try:
        client = get_client()
        response = client.table("assessments").insert(record).execute()
        assessment_id = response.data[0]["id"] if response.data else None
    except Exception:
        # Database is optional for local testing; still return the result
        assessment_id = None

    return {
        "assessment_id": assessment_id,
        "risk_level": result["risk_level"],
        "combined_score": result["combined_score"],
        "model_available": result["model_available"],
        "disclaimer": (
            "This is a preliminary screening result, not a medical diagnosis. "
            "Consult a healthcare professional for evaluation."
        ),
    }
