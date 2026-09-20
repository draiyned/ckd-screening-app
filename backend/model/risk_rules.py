"""
Rule-based risk scoring for factors the UCI-trained model has no data for:
symptoms, family history, and lifestyle factors.

This produces a supplementary risk score (0-1) that gets combined with the
ML model's probability in combined_risk.py. Weights here are a starting
point based on general CKD risk factor guidance, not a validated clinical
scoring system. Have a clinician review these before real use.
"""

def score_symptoms(data):
    score = 0.0
    weights = {
        "swelling": 0.15,
        "fatigue": 0.08,
        "urination_changes": 0.15,
        "nausea": 0.08,
        "other_symptoms": 0.05,
    }
    for field, weight in weights.items():
        if data.get(field):
            score += weight
    return score


def score_medical_history(data):
    score = 0.0
    if data.get("hypertension"):
        score += 0.15
    if data.get("diabetes"):
        score += 0.15
    if data.get("previous_kidney_problems"):
        score += 0.25
    if data.get("other_conditions"):
        score += 0.05
    return score


def score_family_history(data):
    return 0.15 if data.get("family_history_kidney_disease") else 0.0


def score_lifestyle(data):
    score = 0.0
    if data.get("smoking"):
        score += 0.08
    if data.get("alcohol_use"):
        score += 0.05
    if data.get("low_physical_activity"):
        score += 0.05
    if data.get("poor_diet"):
        score += 0.05
    return score


def score_vitals(data):
    score = 0.0
    systolic = data.get("bp_systolic")
    diastolic = data.get("bp_diastolic")
    if systolic is not None:
        if systolic >= 140:
            score += 0.1
        elif systolic >= 130:
            score += 0.05
    if diastolic is not None:
        if diastolic >= 90:
            score += 0.1
        elif diastolic >= 80:
            score += 0.05

    age = data.get("age")
    if age is not None and age >= 60:
        score += 0.1

    return score


def rule_based_score(data):
    """
    data: dict with the user-facing field names from the assessment form.
    Returns a 0-1 score. Capped at 1.0.
    """
    total = (
        score_symptoms(data)
        + score_medical_history(data)
        + score_family_history(data)
        + score_lifestyle(data)
        + score_vitals(data)
    )
    return min(total, 1.0)
