"""
Combines the ML model's prediction (from lab/clinical values) with the
rule-based score (from symptoms, history, lifestyle) into one risk level.

The two are averaged with equal weight. If the model has very little lab
data to work with, its prediction leans on imputed medians, so this combined
approach keeps self-reported risk factors from being ignored.
"""

from model.predict import predict_risk
from model.risk_rules import rule_based_score


def _map_to_model_fields(data):
    """Translate user-facing form fields to the UCI dataset column names."""
    mapped = {
        "age": data.get("age"),
        "bp": data.get("bp_diastolic"),  # UCI dataset's single "bp" column is diastolic
        "sc": data.get("serum_creatinine"),
        "bu": data.get("bun"),
        "bgr": data.get("blood_glucose"),
        "htn": "yes" if data.get("hypertension") else ("no" if data.get("hypertension") is not None else None),
        "dm": "yes" if data.get("diabetes") else ("no" if data.get("diabetes") is not None else None),
        "pe": "yes" if data.get("swelling") else ("no" if data.get("swelling") is not None else None),
    }

    if data.get("urine_protein_albumin") is not None:
        mapped["al"] = 1 if data.get("urine_protein_albumin") else 0

    return {k: v for k, v in mapped.items() if v is not None}


def combined_risk_level(score):
    if score < 0.33:
        return "low"
    if score < 0.66:
        return "moderate"
    return "high"


def assess(data):
    """
    data: dict of user-facing form fields (see AssessmentInput in
    routes/assessment.py for the full field list).
    """
    model_fields = _map_to_model_fields(data)

    model_result = None
    try:
        model_result = predict_risk(model_fields)
        model_score = model_result["probability_ckd"]
    except FileNotFoundError:
        # Model not trained yet: fall back to rule-based score only
        model_score = None

    rule_score = rule_based_score(data)

    if model_score is not None:
        combined_score = (model_score + rule_score) / 2
    else:
        combined_score = rule_score

    return {
        "combined_score": round(combined_score, 3),
        "risk_level": combined_risk_level(combined_score),
        "model_probability": model_result["probability_ckd"] if model_result else None,
        "rule_based_score": round(rule_score, 3),
        "model_available": model_result is not None,
    }
