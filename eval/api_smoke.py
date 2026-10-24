"""End-to-end check against a running API (http://127.0.0.1:8000). Usage: python eval/api_smoke.py [--replay]"""
import json
import sys

import httpx

API = "http://127.0.0.1:8000/api"
c = httpx.Client(timeout=120)


def show(label: str, data) -> None:
    print(f"== {label}")
    print(json.dumps(data, ensure_ascii=False, indent=1)[:1500])


c.post(f"{API}/reset")
show("health", c.get(f"{API}/health").json())
turns = c.get(f"{API}/network").json()["turns"]
show("turns", {z: t["in_turn"] for z, t in turns.items()})

in_turn = c.post(f"{API}/complaints", json={"text": "من امبارح ما في مي بالهاشمي الشمالي والجيران كمان، واليوم دورنا. انا ابو محمد 0791234567"}).json()
show("in-turn complaint", {k: in_turn[k] for k in ("status", "zone", "reply_ar", "text_redacted", "engine", "latency_ms", "dropped")})
out_turn = c.post(f"{API}/complaints", json={"text": "ما في ولا نقطة مي عنا بجبل التاج من الصبح"}).json()
show("out-of-turn complaint", {k: out_turn[k] for k in ("status", "zone", "reply_ar", "engine", "latency_ms")})

if "--replay" in sys.argv:
    show("replay", c.post(f"{API}/replay").json())

analysis = c.get(f"{API}/incidents").json()
show("analysis", {"heatmap_top": analysis["heatmap_top"], "hypotheses": analysis["hypotheses"], "incident": analysis["incident"]})
if analysis["incident"]:
    show("approve", c.post(f"{API}/incidents/approve", json={"segment_id": analysis["incident"]["segment_id"]}).json())
show("public", c.get(f"{API}/public").json()["rows"][:4])
show("privacy", c.get(f"{API}/privacy").json())
show("delete", c.delete(f"{API}/complaints/{in_turn['receipt']}").json())
