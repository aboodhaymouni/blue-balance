"""Run the morning replay stream through the real model once and save the raw outputs.

The demo's "Replay" button then loads in a second instead of ~5 minutes, and is labelled as a replay of this model.
Usage (from the project root, with Ollama running):  python eval/build_replay_cache.py
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import config  # noqa: E402
from api.extract import call_llm  # noqa: E402


def main() -> None:
    lines = (config.DATA / "replay_morning.jsonl").read_text(encoding="utf-8").splitlines()
    items = [json.loads(line) for line in lines if line.strip()]
    cache = {"model": config.LLM_MODEL, "items": {}}
    for i, it in enumerate(items, 1):
        started = time.perf_counter()
        raw = call_llm(it["text"])
        latency = int((time.perf_counter() - started) * 1000)
        cache["items"][it["id"]] = {"raw": raw, "engine": config.LLM_MODEL, "latency_ms": latency}
        print(f"{i}/{len(items)} {it['id']} {latency} ms issue={raw.get('issue', {}).get('value')}")
    config.REPLAY_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"saved {config.REPLAY_CACHE}")


if __name__ == "__main__":
    main()
