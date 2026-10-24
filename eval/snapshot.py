"""Record API responses from the running local stack into web/public/snapshot/ for the static (GitHub Pages) demo.

The static demo replays these recorded results; the models only run on the laptop. Usage: python eval/snapshot.py
"""
import json
from pathlib import Path

import httpx

API = "http://127.0.0.1:8000/api"
OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "snapshot"
OUT.mkdir(parents=True, exist_ok=True)
c = httpx.Client(timeout=120)


def save(name: str, data) -> None:
    (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print("saved", name)


c.post(f"{API}/reset")
save("complaint_anomaly", c.post(f"{API}/complaints", json={"text": "من امبارح ما في مي بالهاشمي الشمالي والجيران كمان، واليوم دورنا. انا ابو محمد 0791234567"}).json())
save("complaint_explained", c.post(f"{API}/complaints", json={"text": "ما في ولا نقطة مي عنا بجبل التاج من امبارح"}).json())
save("replay", c.post(f"{API}/replay").json())

health = c.get(f"{API}/health").json()
save("health", health)
network = c.get(f"{API}/network").json()
network["network"]["disclaimer_ar"] += " هاي نسخة عرض مسجّلة: النماذج المفتوحة بتشتغل على اللابتوب بس."
save("network", network)
save("complaints", c.get(f"{API}/complaints").json())
incidents = c.get(f"{API}/incidents").json()
save("incidents", incidents)
save("privacy", c.get(f"{API}/privacy").json())
segment = incidents["incident"]["segment_id"]
save("approve", c.post(f"{API}/incidents/approve", json={"segment_id": segment}).json())
save("public", c.get(f"{API}/public").json())
save("close", c.post(f"{API}/incidents/close", json={"segment_id": segment}).json())

# Leave the local stack ready for the live demo.
c.post(f"{API}/reset")
print("done; local data reset")
