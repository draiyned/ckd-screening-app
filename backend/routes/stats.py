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


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


@router.get("/stats", dependencies=[Depends(limit("stats", 60, 60))])
def stats():
    try:
        client = get_client()
        try:
            rows = (
                client.table("assessments")
                .select("risk_level,created_at")
                .limit(5000)
                .execute()
                .data
            )
        except Exception:
            # Table has no created_at column. Still count risk levels.
            rows = client.table("assessments").select("risk_level").limit(5000).execute().data

        appointments = client.table("appointments").select("id").limit(5000).execute().data
    except Exception as e:
        print("stats error", type(e).__name__, str(e)[:300])
        raise HTTPException(
            status_code=503,
            detail=f"Statistics are not available right now. {type(e).__name__}: {str(e)[:120]}",
        )

    by_risk = Counter(r.get("risk_level") for r in rows)

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
        "appointments": len(appointments),
        "weekly": [{"week": s.isoformat(), "count": c} for s, c in weekly_counts.items()],
    }
