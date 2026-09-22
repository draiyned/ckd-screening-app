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
    smoking_status = data.get("smoking_status")
    if smoking_status == "current":
        score += 0.12
    elif smoking_status == "former":
        score += 0.05
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

    egfr = data.get("egfr")
    if egfr is not None:
        if egfr < 60:
            score += 0.25
        elif egfr < 90:
            score += 0.1

    return score


def rule_based_score(data):
    total = (
        score_symptoms(data)
        + score_medical_history(data)
        + score_family_history(data)
        + score_lifestyle(data)
        + score_vitals(data)
    )
    return min(total, 1.0)
