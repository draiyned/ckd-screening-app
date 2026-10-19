const API_BASE = "https://ckd-screening-app.vercel.app/api";

const assessmentForm = document.getElementById("assessment-form");
const resultSection = document.getElementById("result");
const riskLevelEl = document.getElementById("risk-level");
const probabilityEl = document.getElementById("probability");
const interventionEl = document.getElementById("intervention");
const disclaimerEl = document.getElementById("disclaimer");
const meterEl = resultSection.querySelector(".meter");
const meterFill = document.getElementById("meter-fill");
const requestApptBtn = document.getElementById("request-appointment-btn");
const goReferralBtn = document.getElementById("go-referral");
const apptFormSection = document.getElementById("appointment-form-section");
const apptForm = document.getElementById("appointment-form");
const apptStatusEl = document.getElementById("appointment-status");
const formErrorEl = document.getElementById("form-error");
const submitBtn = document.getElementById("submit-btn");

let lastAssessmentId = null;
let lastName = "";
let lastEmail = "";

const NUMERIC_FIELDS = ["age", "weight", "serum_creatinine", "bun", "blood_glucose", "egfr"];
const CHECKBOX_FIELDS = [
  "swelling", "fatigue", "urination_changes", "nausea", "other_symptoms",
  "hypertension", "diabetes", "previous_kidney_problems", "other_conditions",
  "family_history_kidney_disease",
  "alcohol_use", "poor_diet", "low_physical_activity", "medication_use",
  "urine_protein_albumin",
];

// Small helpers for data kept in this browser only.
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage can be blocked. The site still works without it. */
  }
}

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

function showFormError(msg) {
  formErrorEl.textContent = msg;
  formErrorEl.classList.toggle("hidden", !msg);
}

assessmentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showFormError("");

  const nameVal = assessmentForm.elements["name"].value.trim();
  const emailVal = assessmentForm.elements["email"].value.trim();
  if (!nameVal || !emailVal || !assessmentForm.elements["email"].validity.valid) {
    showFormError("Please enter your name and a valid email address.");
    return;
  }
  const bpEl = assessmentForm.elements["bp"];
  if (bpEl.value && !bpEl.validity.valid) {
    showFormError("Write blood pressure like 120/80.");
    return;
  }

  const payload = formToPayload(assessmentForm);
  lastName = payload.name;
  lastEmail = payload.email;

  submitBtn.disabled = true;
  submitBtn.textContent = "Checking...";

  try {
    const response = await fetch(`${API_BASE}/assessment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 429) {
      showFormError("Too many attempts from this connection. Please wait a few minutes and try again.");
      return;
    }
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const data = await response.json();
    lastAssessmentId = data.assessment_id;

    const pct = data.combined_score * 100;
    riskLevelEl.textContent = data.risk_level;
    riskLevelEl.className = `risk-level ${data.risk_level}`;
    probabilityEl.textContent = `Combined risk score: ${pct.toFixed(1)}%`;
    interventionEl.textContent = data.suggested_intervention || "";
    disclaimerEl.textContent = data.disclaimer || "";
    meterEl.className = `meter ${data.risk_level}`;
    meterFill.style.width = `${Math.max(2, Math.min(100, pct))}%`;

    resultSection.classList.remove("hidden");
    resultSection.scrollIntoView({ behavior: "smooth" });

    const higher = data.risk_level === "moderate" || data.risk_level === "high";
    requestApptBtn.classList.toggle("hidden", !higher);
    goReferralBtn.classList.toggle("hidden", !higher);
    apptForm.classList.remove("hidden");
    apptStatusEl.textContent = "";

    // Keep a short record on this device for the Dashboard and Referral pages.
    const record = {
      date: new Date().toISOString(),
      level: data.risk_level,
      score: data.combined_score,
      name: payload.name,
      email: payload.email,
      assessment_id: data.assessment_id || null,
    };
    saveJSON("ckd_last", record);
    const history = loadJSON("ckd_history", []);
    history.push({ date: record.date, level: record.level, score: record.score });
    saveJSON("ckd_history", history.slice(-30));
    document.dispatchEvent(new CustomEvent("ckd:result", { detail: record }));
  } catch (err) {
    showFormError("Something went wrong submitting your assessment. Please check your connection and try again.");
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Get my risk assessment";
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
    apptStatusEl.classList.remove("bad");
    apptForm.classList.add("hidden");
  } catch (err) {
    apptStatusEl.textContent = "Could not submit your request. Please try again.";
    apptStatusEl.classList.add("bad");
    console.error(err);
  }
});
