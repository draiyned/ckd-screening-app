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
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ratelimit import limit

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
- Use plain text only. No markdown, no asterisks, no headings. For a list, write short lines that start with a dash.
- Always finish your last sentence.

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
        "messages": [{"role": "user", "content": "In one short sentence, what is eGFR?"}],
        "max_tokens": 60,
    }
    try:
        resp = httpx.post(url, headers=provider_headers(api_key, url), json=payload, timeout=20.0)
    except httpx.HTTPError as e:
        info["problem"] = "Could not reach the model service: " + type(e).__name__
        return info

    info["provider_status"] = resp.status_code
    info["content_type"] = resp.headers.get("content-type", "")
    info["body_preview"] = resp.text[:300]
    if resp.status_code >= 400:
        info["provider_message"] = resp.text[:300]
        info["problem"] = "The model service refused the request. Read provider_message."
    else:
        info["result"] = "Working"
    return info


@router.post("/chat", dependencies=[Depends(limit("chat", 60, 600))])
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
        # Some models count hidden thinking inside this limit, so keep it generous.
        "max_tokens": int(os.environ.get("CHAT_MAX_TOKENS", "1500")),
    }
    effort = os.environ.get("CHAT_REASONING_EFFORT")
    if effort:
        payload["reasoning_effort"] = effort

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
        choice = resp.json()["choices"][0]
        reply = (choice["message"]["content"] or "").strip()
        finish = choice.get("finish_reason")
    except (KeyError, IndexError, ValueError, TypeError, AttributeError):
        # GitHub Models sometimes sends the answer as plain text, not JSON.
        body = resp.text.strip()
        if not body or body.startswith("{") or body.startswith("["):
            print("chat unexpected reply", resp.status_code, resp.text[:500])
            raise HTTPException(
                status_code=502,
                detail="Unexpected reply from the chat service. Got: " + resp.text[:200],
            )
        reply = body
        finish = None

    if not reply:
        raise HTTPException(status_code=502, detail="The chat service sent an empty reply.")

    if finish == "length":
        reply += " ... (My answer was cut short. Ask me to continue.)"

    return {"reply": reply}
