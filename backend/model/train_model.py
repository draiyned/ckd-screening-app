"""
CKD Risk Classification - Model Training Script

Trains a classifier on the UCI Chronic Kidney Disease dataset and saves it
for use in the assessment API.

Dataset: https://archive.ics.uci.edu/dataset/336/chronic+kidney+disease
Download the CSV and place it at: backend/model/dataset.csv

Expected columns (standard UCI CKD dataset):
age, bp, sg, al, su, rbc, pc, pcc, ba, bgr, bu, sc, sod, pot, hemo, pcv,
wc, rc, htn, dm, cad, appet, pe, ane, classification
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.impute import SimpleImputer
from sklearn.metrics import classification_report, confusion_matrix
import joblib
import os

DATA_PATH = os.path.join(os.path.dirname(__file__), "dataset.csv")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "ckd_model.pkl")
ENCODERS_PATH = os.path.join(os.path.dirname(__file__), "encoders.pkl")

NUMERIC_COLS = [
    "age", "bp", "sg", "al", "su", "bgr", "bu", "sc", "sod",
    "pot", "hemo", "pcv", "wc", "rc"
]
CATEGORICAL_COLS = [
    "rbc", "pc", "pcc", "ba", "htn", "dm", "cad", "appet", "pe", "ane"
]
TARGET_COL = "classification"


def load_data(path):
    df = pd.read_csv(path)
    df.columns = [c.strip() for c in df.columns]
    return df


def clean_data(df):
    # Strip whitespace and normalize inconsistent labels found in the raw dataset
    for col in CATEGORICAL_COLS + [TARGET_COL]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().str.lower()

    df[TARGET_COL] = df[TARGET_COL].replace({
        "ckd": 1, "ckd\t": 1, "notckd": 0, "not ckd": 0
    })

    for col in NUMERIC_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    return df


def encode_categoricals(df, encoders=None):
    fit_mode = encoders is None
    if fit_mode:
        encoders = {}

    for col in CATEGORICAL_COLS:
        if col not in df.columns:
            continue
        df[col] = df[col].replace({"nan": np.nan})
        if fit_mode:
            le = LabelEncoder()
            non_null = df[col].dropna()
            le.fit(non_null)
            encoders[col] = le
        le = encoders[col]
        mask = df[col].notna()
        df.loc[mask, col] = le.transform(df.loc[mask, col])
        df[col] = pd.to_numeric(df[col], errors="coerce")

    return df, encoders


def build_pipeline_data(df):
    df = clean_data(df)
    df, encoders = encode_categoricals(df)

    feature_cols = NUMERIC_COLS + CATEGORICAL_COLS
    feature_cols = [c for c in feature_cols if c in df.columns]

    X = df[feature_cols]
    y = df[TARGET_COL]

    imputer = SimpleImputer(strategy="median")
    X_imputed = imputer.fit_transform(X)

    return X_imputed, y, feature_cols, imputer, encoders


def train():
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(
            f"Dataset not found at {DATA_PATH}. "
            "Download the UCI CKD dataset and place it there as dataset.csv."
        )

    df = load_data(DATA_PATH)
    X, y, feature_cols, imputer, encoders = build_pipeline_data(df)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,
        min_samples_leaf=3,
        random_state=42,
        class_weight="balanced",
    )

    scores = cross_val_score(model, X_train, y_train, cv=5)
    print(f"Cross-validation accuracy: {scores.mean():.3f} (+/- {scores.std():.3f})")

    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    print("\nTest set performance:")
    print(classification_report(y_test, y_pred, target_names=["not_ckd", "ckd"]))
    print("Confusion matrix:")
    print(confusion_matrix(y_test, y_pred))

    importances = sorted(
        zip(feature_cols, model.feature_importances_),
        key=lambda x: x[1],
        reverse=True,
    )
    print("\nTop features:")
    for name, score in importances[:10]:
        print(f"  {name}: {score:.3f}")

    joblib.dump({
        "model": model,
        "imputer": imputer,
        "feature_cols": feature_cols,
    }, MODEL_PATH)
    joblib.dump(encoders, ENCODERS_PATH)

    print(f"\nModel saved to {MODEL_PATH}")
    print(f"Encoders saved to {ENCODERS_PATH}")


if __name__ == "__main__":
    train()
