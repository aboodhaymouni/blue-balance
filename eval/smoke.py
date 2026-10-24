"""Quick check that the open model answers with valid, evidence-backed fields. Usage: python eval/smoke.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.extract import check_evidence, extract  # noqa: E402
from api.pii import mask  # noqa: E402

SAMPLES = [
    "من امبارح ما في مي بالحارة كلها والجيران كمان، واليوم دورنا. انا ابو محمد 0791234567",
    "المي مش مقطوعة بس ضعيفة كثير وما بتطلع عالخزان",
    "في تنك عم يعبي من المحبس جنب الدوار من الصبح",
]

for text in SAMPLES:
    result = extract(text)
    fields, dropped, pii = check_evidence(text, result["raw"])
    masked, _ = mask(text, pii)
    filled = {k: v["value"] for k, v in fields.items() if v["value"] is not None}
    print(json.dumps({"engine": result["engine"], "ms": result["latency_ms"], "error": result["error"], "fields": filled,
                      "dropped": dropped, "masked": masked}, ensure_ascii=False))
