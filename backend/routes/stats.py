"""
Anonymous totals for the Dashboard page.

Returns counts only. It never sends names, emails, or any single person's answers.
"""

from collections import Counter
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from database import get_client
from ratelimit import limit

router = APIRouter()

WEEKS = 8

AGE_GROUPS = [
    ("16_18", "16 to 18", 16, 18),
    ("19_21", "19 to 21", 19, 21),
    ("22_25", "22 to 25", 22, 25),
    ("26_30", "26 to 30", 26, 30),
]


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def age_key(age):
    try:
        a = float(age)
    except (TypeError, ValueError):
        return "unknown"
    for key, _label, lo, hi in AGE_GROUPS:
        if lo <= a <= hi:
            return key
    return "unknown"


@router.get("/stats", dependencies=[Depends(limit("stats", 60, 60))])
def stats():
    try:
        client = get_client()
        rows = None
        # Try the richest query first. Fall back if a column is missing.
        for cols in ("risk_level,created_at,age", "risk_level,created_at", "risk_level"):
            try:
                rows = client.table("assessments").select(cols).limit(5000).execute().data
                break
            except Exception:
                rows = None
        if rows is None:
            rows = client.table("assessments").select("risk_level").limit(5000).execute().data

        appointments = client.table("appointments").select("id").limit(5000).execute().data
    except Exception as e:
        print("stats error", type(e).__name__, str(e)[:300])
        raise HTTPException(
            status_code=503,
            detail=f"Statistics are not available right now. {type(e).__name__}: {str(e)[:120]}",
        )

    by_risk = Counter(r.get("risk_level") for r in rows)

    by_age = {key: {"low": 0, "moderate": 0, "high": 0} for key, *_ in AGE_GROUPS}
    by_age["unknown"] = {"low": 0, "moderate": 0, "high": 0}
    for r in rows:
        level = r.get("risk_level")
        if level in ("low", "moderate", "high"):
            by_age[age_key(r.get("age"))][level] += 1

    this_week = week_start(date.today())
    starts = [this_week - timedelta(weeks=i) for i in range(WEEKS - 1, -1, -1)]
    weekly_counts = {s: 0 for s in starts}

    for r in rows:
        created = r.get("created_at")
        if not created:
            continue
        try:
            d = datetime.fromisoformat(created.replace("Z", "+00:00")).date()
        except ValueError:
            continue
        s = week_start(d)
        if s in weekly_counts:
            weekly_counts[s] += 1

    return {
        "total": len(rows),
        "by_risk": {
            "low": by_risk.get("low", 0),
            "moderate": by_risk.get("moderate", 0),
            "high": by_risk.get("high", 0),
        },
        "by_age": by_age,
        "age_labels": {key: label for key, label, *_ in AGE_GROUPS},
        "appointments": len(appointments),
        "weekly": [{"week": s.isoformat(), "count": c} for s, c in weekly_counts.items()],
    }
