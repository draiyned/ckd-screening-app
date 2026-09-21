const API_BASE = "https://ckd-screening-app.vercel.app/api"; // change to your deployed Render URL

const assessmentForm = document.getElementById("assessment-form");
const resultSection = document.getElementById("result");
const riskLevelEl = document.getElementById("risk-level");
const probabilityEl = document.getElementById("probability");
const disclaimerEl = document.getElementById("disclaimer");
const requestApptBtn = document.getElementById("request-appointment-btn");
const apptFormSection = document.getElementById("appointment-form-section");
const apptForm = document.getElementById("appointment-form");
const apptStatusEl = document.getElementById("appointment-status");

let lastAssessmentId = null;
let lastName = "";
let lastEmail = "";

const NUMERIC_FIELDS = ["age", "weight", "serum_creatinine", "bun", "blood_glucose"];
const CHECKBOX_FIELDS = [
  "swelling", "fatigue", "urination_changes", "nausea", "other_symptoms",
  "hypertension", "diabetes", "previous_kidney_problems", "other_conditions",
  "family_history_kidney_disease",
  "smoking", "alcohol_use", "poor_diet", "low_physical_activity", "medication_use",
  "urine_protein_albumin",
];

function formToPayload(form) {
  const formData = new FormData(form);
  const obj = {};

  for (const [key, value] of formData.entries()) {
    if (NUMERIC_FIELDS.includes(key)) {
      obj[key] = value === "" ? null : parseFloat(value);
    } else if (!CHECKBOX_FIELDS.includes(key)) {
      obj[key] = value === "" ? null : value;
    }
  }

  CHECKBOX_FIELDS.forEach((field) => {
    const el = form.querySelector(`[name="${field}"]`);
    if (el) obj[field] = el.checked;
  });

  if (obj.bp) {
    const parts = obj.bp.split("/");
    obj.bp_systolic = parts[0] ? parseFloat(parts[0]) : null;
    obj.bp_diastolic = parts[1] ? parseFloat(parts[1]) : null;
  } else {
    obj.bp_systolic = null;
    obj.bp_diastolic = null;
  }
  delete obj.bp;

  return obj;
}

assessmentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = formToPayload(assessmentForm);

  lastName = payload.name;
  lastEmail = payload.email;

  try {
    const response = await fetch(`${API_BASE}/assessment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const data = await response.json();
    lastAssessmentId = data.assessment_id;

    riskLevelEl.textContent = data.risk_level;
    riskLevelEl.className = `risk-level ${data.risk_level}`;
    probabilityEl.textContent = `Combined risk score: ${(data.combined_score * 100).toFixed(1)}%`;
    disclaimerEl.textContent = data.disclaimer;

    resultSection.classList.remove("hidden");
    resultSection.scrollIntoView({ behavior: "smooth" });

    if (data.risk_level === "moderate" || data.risk_level === "high") {
      requestApptBtn.classList.remove("hidden");
    } else {
      requestApptBtn.classList.add("hidden");
    }
  } catch (err) {
    alert("Something went wrong submitting your assessment. Please try again.");
    console.error(err);
  }
});

requestApptBtn.addEventListener("click", () => {
  apptFormSection.classList.remove("hidden");
  apptFormSection.scrollIntoView({ behavior: "smooth" });
});

apptForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formValues = new FormData(apptForm);

  const payload = {
    assessment_id: lastAssessmentId,
    name: lastName,
    email: lastEmail,
    phone: formValues.get("phone"),
    preferred_provider: formValues.get("preferred_provider"),
  };

  try {
    const response = await fetch(`${API_BASE}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const data = await response.json();
    apptStatusEl.textContent = data.message;
    apptForm.classList.add("hidden");
  } catch (err) {
    apptStatusEl.textContent = "Could not submit your request. Please try again.";
    console.error(err);
  }
});
