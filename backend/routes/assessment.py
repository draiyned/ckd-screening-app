from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from model.combined_risk import assess
from database import get_client

router = APIRouter()

INTERVENTIONS = {
    "low": "Your risk appears low. Keep up healthy habits: stay hydrated, manage blood pressure, and get a routine checkup once a year.",
    "moderate": "Your risk is moderate. Consider scheduling a checkup with a doctor soon to review your blood pressure, blood sugar, and kidney function.",
    "high": "Your risk is high. Please schedule a checkup with a healthcare professional as soon as possible for proper testing and evaluation.",
}


class AssessmentInput(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    age: Optional[float] = None
    sex: Optional[str] = None
    blood_type: Optional[str] = None
    last_checkup: Optional[str] = None

    bp_systolic: Optional[float] = None
    bp_diastolic: Optional[float] = None
    weight: Optional[float] = None
    last_meal: Optional[str] = None

    swelling: Optional[bool] = None
    fatigue: Optional[bool] = None
    urination_changes: Optional[bool] = None
    nausea: Optional[bool] = None
    other_symptoms: Optional[bool] = None
    other_symptoms_note: Optional[str] = None

    hypertension: Optional[bool] = None
    diabetes: Optional[bool] = None
    previous_kidney_problems: Optional[bool] = None
    other_conditions: Optional[bool] = None
    other_conditions_note: Optional[str] = None

    family_history_kidney_disease: Optional[bool] = None

    smoking_status: Optional[str] = None
    alcohol_use: Optional[bool] = None
    poor_diet: Optional[bool] = None
    low_physical_activity: Optional[bool] = None
    medication_use: Optional[bool] = None
    medication_use_note: Optional[str] = None

    serum_creatinine: Optional[float] = None
    bun: Optional[float] = None
    urine_protein_albumin: Optional[bool] = None
    blood_glucose: Optional[float] = None
    egfr: Optional[float] = None


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
