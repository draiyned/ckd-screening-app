"""
Loads the trained CKD model and converts predictions into risk levels.
Used by the assessment API route.
"""

import os
import joblib
import numpy as np

MODEL_PATH = os.path.join(os.path.dirname(__file__), "ckd_model.pkl")
ENCODERS_PATH = os.path.join(os.path.dirname(__file__), "encoders.pkl")

_bundle = None
_encoders = None


def _load():
    global _bundle, _encoders
    if _bundle is None:
        _bundle = joblib.load(MODEL_PATH)
        _encoders = joblib.load(ENCODERS_PATH)
    return _bundle, _encoders


def risk_level_from_probability(prob_ckd):
    """
    Maps the model's predicted probability of CKD to a risk band.
    Thresholds are a starting point. Validate against clinical guidance
    before using this in a real screening tool.
    """
    if prob_ckd < 0.33:
        return "low"
    if prob_ckd < 0.66:
        return "moderate"
    return "high"


def predict_risk(input_dict):
    """
    input_dict: raw feature values keyed by the UCI CKD column names,
    e.g. {"age": 45, "bp": 80, "sg": 1.02, "al": 1, "htn": "yes", ...}
    Missing fields are imputed with training-set medians.
    """
    bundle, encoders = _load()
    model = bundle["model"]
    imputer = bundle["imputer"]
    feature_cols = bundle["feature_cols"]

    row = []
    for col in feature_cols:
        val = input_dict.get(col, np.nan)
        if col in encoders and isinstance(val, str):
            le = encoders[col]
            val = val.strip().lower()
            val = le.transform([val])[0] if val in le.classes_ else np.nan
        row.append(val)

    row = np.array(row, dtype=float).reshape(1, -1)
    row = imputer.transform(row)

    prob_ckd = model.predict_proba(row)[0][1]
    return {
        "probability_ckd": round(float(prob_ckd), 3),
        "risk_level": risk_level_from_probability(prob_ckd),
    }
