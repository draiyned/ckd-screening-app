"""
Chat endpoint: answers questions about chronic kidney disease (CKD).

Calls any OpenAI-compatible chat completions API. The default provider is
GitHub Models. Set these environment variables in Vercel:

  CHAT_API_KEY   required. Token for the provider. Never put it in the frontend.
  CHAT_API_URL   optional. Default: https://models.github.ai/inference/chat/completions
  CHAT_MODEL     optional. Default: openai/gpt-4.1-mini
"""

import os
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

DEFAULT_URL = "https://models.github.ai/inference/chat/completions"
DEFAULT_MODEL = "openai/gpt-4.1-mini"
MAX_HISTORY = 8

SYSTEM_PROMPT = """You are the CKD Assistant on a chronic kidney disease (CKD) screening website.

Scope
- Talk only about CKD, kidney health, and how this screening tool works.
- If the user asks about anything else, say you only help with kidney health topics.

Style
- Reply in the language the user writes in (English, Tagalog, or Hiligaynon).
- Use short sentences and common words. Explain medical terms in plain words.
- Keep replies under 150 words.

Safety rules
- Never diagnose. Never say the user has CKD or does not have CKD.
- Do not name medicines, doses, or treatment plans. Never tell a user to start or stop a medicine.
- For any personal health concern, tell the user to see a doctor.
- If the user describes chest pain, trouble breathing, confusion, very little or no urine, severe swelling, or vomiting that will not stop, tell them to go to the nearest emergency room now.

What you explain
- What CKD is and its stages.
- Risk factors: high blood pressure, diabetes, family history, smoking, heavy use of painkillers, older age.
- Common symptoms: swelling, tiredness, changes in urination, nausea, poor appetite. Early CKD often has no symptoms.
- Common tests: serum creatinine, BUN, urine albumin or protein, and eGFR. The eGFR normal range is 90 or above. A value below 60 points to possible kidney disease and needs a doctor's review.
- General prevention: control blood pressure and blood sugar, drink enough water, eat less salt, stay active, do not smoke, avoid regular painkiller overuse, get yearly checkups.

If you are not sure about a fact, say so and suggest asking a doctor."""


class ChatMessage(BaseModel):
    role: str
    content: str = Field(max_length=1500)


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(max_length=20)
    risk_level: Optional[str] = None
    risk_score: Optional[float] = None


def build_system_prompt(risk_level, risk_score):
    prompt = SYSTEM_PROMPT
    if risk_level in ("low", "moderate", "high"):
        pct = ""
        if isinstance(risk_score, (int, float)):
            pct = f" ({round(risk_score * 100)}%)"
        prompt += (
            "\n\nThe user just finished the screening on this site. "
            f"The result was {risk_level} risk{pct}. "
            "You may refer to it. Remind the user it is a screening result, not a diagnosis. "
            "For moderate or high risk, encourage a checkup with a doctor."
        )
    return prompt


def provider_headers(api_key, url):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if "models.github.ai" in url:
        headers["Accept"] = "application/vnd.github+json"
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    return headers


@router.get("/chat/status")
def chat_status():
    """Open this page in a browser to see why the chat fails. It never shows the token."""
    api_key = os.environ.get("CHAT_API_KEY")
    url = os.environ.get("CHAT_API_URL", DEFAULT_URL)
    model = os.environ.get("CHAT_MODEL", DEFAULT_MODEL)
    info = {"key_set": bool(api_key), "model": model, "url": url}
    if not api_key:
        info["problem"] = "CHAT_API_KEY is empty or missing. Add it in Vercel, then redeploy."
        return info

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Reply with the word OK."}],
        "max_tokens": 5,
    }
    try:
        resp = httpx.post(url, headers=provider_headers(api_key, url), json=payload, timeout=20.0)
    except httpx.HTTPError as e:
        info["problem"] = "Could not reach the model service: " + type(e).__name__
        return info

    info["provider_status"] = resp.status_code
    if resp.status_code >= 400:
        info["provider_message"] = resp.text[:300]
        info["problem"] = "The model service refused the request. Read provider_message."
    else:
        info["result"] = "Working"
    return info


@router.post("/chat")
def chat(req: ChatRequest):
    api_key = os.environ.get("CHAT_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Chat is not set up yet.")

    history = [
        {"role": m.role, "content": m.content.strip()}
        for m in req.messages
        if m.role in ("user", "assistant") and m.content.strip()
    ][-MAX_HISTORY:]

    if not history or history[-1]["role"] != "user":
        raise HTTPException(status_code=400, detail="Send a user message.")

    url = os.environ.get("CHAT_API_URL", DEFAULT_URL)
    model = os.environ.get("CHAT_MODEL", DEFAULT_MODEL)
    headers = provider_headers(api_key, url)

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": build_system_prompt(req.risk_level, req.risk_score)}
        ]
        + history,
        "temperature": 0.3,
        "max_tokens": 400,
    }

    try:
        resp = httpx.post(url, headers=headers, json=payload, timeout=25.0)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not reach the chat service.")

    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="The chat is busy. Try again in a minute.")
    if resp.status_code >= 400:
        # Shows in the Vercel logs. Helps when the model name or token is wrong.
        print("chat provider error", resp.status_code, resp.text[:300])
        raise HTTPException(status_code=502, detail="The chat service returned an error.")

    try:
        reply = resp.json()["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, ValueError, TypeError, AttributeError):
        print("chat unexpected reply", resp.status_code, resp.text[:500])
        raise HTTPException(
            status_code=502,
            detail="Unexpected reply from the chat service. Got: " + resp.text[:200],
        )

    if not reply:
        raise HTTPException(status_code=502, detail="The chat service sent an empty reply.")

    return {"reply": reply}
