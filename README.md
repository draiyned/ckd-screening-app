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
