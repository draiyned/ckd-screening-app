"""
User feedback survey. Four sections of statements rated 1 (strongly disagree) to 5 (strongly agree).

POST /api/feedback         saves one response
GET  /api/feedback/summary returns averages only. Comments are never sent back.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import get_client
from ratelimit import limit

router = APIRouter()

SECTION_SIZES = [5, 7, 6, 5]


class FeedbackRequest(BaseModel):
    answers: List[List[int]] = Field(..., max_length=4)
    comment: Optional[str] = Field(None, max_length=500)


def check_answers(answers):
    if len(answers) != len(SECTION_SIZES):
        raise HTTPException(status_code=422, detail="Please answer every statement.")
    for section, size in zip(answers, SECTION_SIZES):
        if len(section) != size or any(v < 1 or v > 5 for v in section):
            raise HTTPException(status_code=422, detail="Each answer must be from 1 to 5.")


@router.post("/feedback", dependencies=[Depends(limit("feedback", 20, 3600))])
def submit_feedback(payload: FeedbackRequest):
    check_answers(payload.answers)
    comment = (payload.comment or "").strip() or None
    try:
        get_client().table("feedback").insert(
            {"answers": payload.answers, "comment": comment}
        ).execute()
    except Exception as e:
        print("feedback not saved:", type(e).__name__, str(e)[:200])
        raise HTTPException(
            status_code=503,
            detail=f"Could not save your feedback right now. {type(e).__name__}: {str(e)[:120]}",
        )
    return {"message": "Thank you. Your feedback was saved."}


@router.get("/feedback/summary", dependencies=[Depends(limit("feedback_summary", 60, 60))])
def feedback_summary():
    try:
        rows = get_client().table("feedback").select("answers").limit(5000).execute().data
    except Exception as e:
        print("feedback summary error:", type(e).__name__, str(e)[:200])
        raise HTTPException(
            status_code=503,
            detail=f"Results are not available right now. {type(e).__name__}: {str(e)[:120]}",
        )

    sums = [[0.0] * n for n in SECTION_SIZES]
    dist = [[[0] * 5 for _ in range(n)] for n in SECTION_SIZES]  # dist[section][item][score - 1]
    count = 0
    for r in rows:
        a = r.get("answers")
        try:
            check_answers(a)
        except Exception:
            continue
        count += 1
        for si, section in enumerate(a):
            for i, v in enumerate(section):
                sums[si][i] += v
                dist[si][i][v - 1] += 1

    sections = []
    for si, size in enumerate(SECTION_SIZES):
        items = [round(sums[si][i] / count, 2) if count else None for i in range(size)]
        mean = round(sum(items) / size, 2) if count else None
        sections.append({"mean": mean, "items": items, "dist": dist[si]})
    return {"count": count, "sections": sections}
