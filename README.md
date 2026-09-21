# CKD Screening Platform

An AI-driven preliminary screening tool for Chronic Kidney Disease (CKD) risk.
Users enter symptoms and health information. The system classifies risk as
low, moderate, or high, and offers an appointment request for higher-risk users.

This tool does not diagnose CKD. It is a screening aid to guide people toward
professional consultation.

## How risk is calculated

The UCI dataset the model trains on only has lab/clinical values (blood
pressure, blood counts, etc). It has no data on symptoms, family history, or
lifestyle factors. So risk is calculated in two parts:

- **Model score**: a Random Forest trained on the UCI CKD dataset, using
  whatever lab values the user provides (blood pressure, serum creatinine,
  BUN, blood glucose, hypertension, diabetes, swelling). Missing values are
  imputed with training-set medians.
- **Rule-based score**: a weighted point system for symptoms, medical and
  family history, and lifestyle factors not present in the dataset (see
  `backend/model/risk_rules.py`).

The two scores are averaged into a combined risk level (low/moderate/high).
The rule weights are a starting point, not a validated clinical scoring
system. Have a clinician review them before using this with real users.

## Project structure

```
ckd-screening-app/
├── backend/
│   ├── app.py                 # FastAPI entry point
│   ├── database.py            # Supabase client + schema
│   ├── .env.example
│   ├── requirements.txt
│   ├── model/
│   │   ├── train_model.py     # trains the CKD classifier
│   │   ├── predict.py         # loads model, returns risk level
│   │   └── dataset.csv        # not included, see setup below
│   └── routes/
│       ├── assessment.py
│       └── appointments.py
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── .gitignore
└── README.md
```

## Setup

### 1. Get the dataset

Download the UCI Chronic Kidney Disease dataset:
https://archive.ics.uci.edu/dataset/336/chronic+kidney+disease

Save it as `backend/model/dataset.csv`.

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# fill in SUPABASE_URL and SUPABASE_KEY

python model/train_model.py   # trains and saves the model
uvicorn app:app --reload      # runs the API on http://localhost:8000
```

### 3. Supabase

Create a project at supabase.com, then run the SQL in `database.py`'s
docstring in the Supabase SQL editor to create the `assessments` and
`appointments` tables.

### 4. Frontend

Open `frontend/index.html` directly in a browser, or serve it:

```bash
cd frontend
python -m http.server 5500
```

Update `API_BASE` in `script.js` to match your backend URL once deployed.

## Deployment

- **Backend:** Render. Connect the repo, set the root directory to `backend`,
  build command `pip install -r requirements.txt`, start command
  `uvicorn app:app --host 0.0.0.0 --port $PORT`. Add `SUPABASE_URL` and
  `SUPABASE_KEY` as environment variables. Note: also upload a trained
  `ckd_model.pkl` and `encoders.pkl`, or run the training script as part
  of your build step, since the model file is gitignored.
- **Frontend:** Vercel. Point it at the `frontend` folder as a static site.

## Disclaimer

This is a screening tool, not a diagnostic device. Validate the model against
clinical guidance before using it with real users, and always direct
moderate/high risk users to a licensed healthcare professional.

## Limitations

This is a functional prototype, not a clinically validated tool. Known limitations:

- **Training data size**: the ML model is trained on the UCI Chronic Kidney Disease dataset (Rubini, L., Soundarapandian, P., and Eswaran, P., 2015), which has only 400 patient records. This is small by clinical ML standards and limits how well the model generalizes.
- **Unvalidated rule weights**: the rule-based scoring (symptoms, family history, lifestyle) in `backend/model/risk_rules.py` uses point values based on general CKD risk factor knowledge, not weights derived from or tested against real patient outcome data.
- **No clinical validation**: the combined risk score has not been validated against real diagnoses. It has not been reviewed by a nephrologist or other clinician.
- **Fields collected but not scored**: blood type, last checkup date, and last meal eaten are captured for context but do not currently affect the risk calculation. Blood type has no established link to CKD risk. Last meal is only relevant for interpreting a fasting glucose result, which this tool does not distinguish from a non-fasting one.
- **Small feature overlap**: only some self-reported fields (blood pressure, hypertension, diabetes, swelling, and optional lab values) map onto the ML model's trained features. Most of the model's other input columns are filled in with dataset medians when not provided by the user, which reduces the model's precision for any individual user.

Before any real-world use, this tool would need validation against a larger, outcome-labeled dataset and clinical review of the scoring criteria.
