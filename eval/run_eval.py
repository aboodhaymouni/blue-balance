"""Score the extraction engines on the labelled complaint sets and save the results.

Usage (from the project root):
  python eval/run_eval.py --set test --engine llm
  python eval/run_eval.py --set dev --engine rules
Writes eval/results/<set>-<engine>.json and prints a summary.
"""
import argparse
import json
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import config  # noqa: E402
from api.extract import BOOLEAN_FIELDS, call_llm, check_evidence, fill_gaps, rules_extract  # noqa: E402
from api.pii import mask  # noqa: E402
from api.places import Gazetteer  # noqa: E402

SCORED = ["issue", "since", "turn_claim", "neighbours_too", "tanker_seen"]


def load(name: str) -> list[dict]:
    lines = (config.DATA / f"complaints_{name}.jsonl").read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def gold(label: dict, field: str):
    value = label.get(field)
    return None if (field in BOOLEAN_FIELDS and value is False) else value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--set", default="test", choices=["dev", "test"])
    parser.add_argument("--engine", default="llm", choices=["llm", "rules"])
    parser.add_argument("--no-fill", action="store_true", help="score the model alone, without the rules filling dropped issues")
    args = parser.parse_args()

    gazetteer = Gazetteer(config.DATA / "gazetteer.json")
    items = load(args.set)
    rows, latencies = [], []
    totals = {"stated": 0, "stated_correct": 0, "invented": 0, "wrong": 0, "dropped": 0,
              "zone_correct": 0, "zone_total": 0, "pii_total": 0, "pii_masked": 0, "issue_correct": 0}

    for it in items:
        text, label = it["text"], it["label"]
        started = time.perf_counter()
        raw = call_llm(text) if args.engine == "llm" else rules_extract(text)
        latencies.append(time.perf_counter() - started)
        fields, dropped, pii = check_evidence(text, raw)
        if args.engine == "llm" and not args.no_fill:
            fill_gaps(text, fields)
        masked, _ = mask(text, pii, keep=gazetteer.normalised_aliases)
        totals["dropped"] += len(dropped)

        for f in SCORED:
            want, got = gold(label, f), fields[f]["value"]
            if want is not None:
                totals["stated"] += 1
                if got == want:
                    totals["stated_correct"] += 1
                elif got is not None:
                    totals["wrong"] += 1
            elif got is not None:
                totals["invented"] += 1
        totals["issue_correct"] += int(fields["issue"]["value"] == label.get("issue"))

        zone = gazetteer.resolve(fields["place_phrase"]["quote"], text)
        if label.get("zone"):
            totals["zone_total"] += 1
            totals["zone_correct"] += int(zone == label["zone"])
        for span in label.get("pii") or []:
            totals["pii_total"] += 1
            totals["pii_masked"] += int(span not in masked)

        rows.append({"id": it["id"], "fields": fields, "dropped": dropped, "zone": zone, "label": label})

    summary = {
        "set": args.set, "n": len(items),
        "engine": "rules" if args.engine == "rules" else config.LLM_MODEL + ("" if args.no_fill else " + rules fill"),
        "issue_accuracy": f"{totals['issue_correct']}/{len(items)}",
        "stated_values_correct": f"{totals['stated_correct']}/{totals['stated']}",
        "invented_fields": totals["invented"], "wrong_values": totals["wrong"], "quotes_dropped": totals["dropped"],
        "zone_accuracy": f"{totals['zone_correct']}/{totals['zone_total']}",
        "pii_masked": f"{totals['pii_masked']}/{totals['pii_total']}",
        "latency_median_s": round(statistics.median(latencies), 2), "latency_max_s": round(max(latencies), 2),
    }
    suffix = "-alone" if args.engine == "llm" and args.no_fill else ""
    out = ROOT / "eval" / "results" / f"{args.set}-{args.engine}{suffix}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
