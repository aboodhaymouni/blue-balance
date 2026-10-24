"""Supply turns: is a zone in its turn at a given time, and when is its next window."""
import json
from datetime import datetime, time, timedelta
from pathlib import Path

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]  # datetime.weekday() order
AR_DAYS = {"sat": "السبت", "sun": "الأحد", "mon": "الاثنين", "tue": "الثلاثاء", "wed": "الأربعاء", "thu": "الخميس", "fri": "الجمعة"}


class Schedules:
    def __init__(self, path: Path):
        self.turns: dict[str, list[dict]] = json.loads(path.read_text(encoding="utf-8"))

    def in_turn(self, zone: str, when: datetime) -> bool:
        day, hm = DAYS[when.weekday()], when.strftime("%H:%M")
        return any(t["day"] == day and t["start"] <= hm < t["end"] for t in self.turns.get(zone, []))

    def next_window(self, zone: str, when: datetime) -> tuple[datetime, datetime] | None:
        for offset in range(8):
            date = (when + timedelta(days=offset)).date()
            for t in sorted(self.turns.get(zone, []), key=lambda t: t["start"]):
                if t["day"] != DAYS[date.weekday()]:
                    continue
                start = datetime.combine(date, time.fromisoformat(t["start"]), tzinfo=when.tzinfo)
                end = datetime.combine(date, time.fromisoformat(t["end"]), tzinfo=when.tzinfo)
                if end > when:
                    return start, end
        return None

    def next_window_ar(self, zone: str, when: datetime) -> str:
        window = self.next_window(zone, when)
        if window is None:
            return "ما في دور مسجّل"
        start, end = window
        if start <= when:
            return f"دوركم هلأ لحد الساعة {end:%H:%M}"
        return f"يوم {AR_DAYS[DAYS[start.weekday()]]} من الساعة {start:%H:%M} لـ {end:%H:%M}"
