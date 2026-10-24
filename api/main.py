"""Blue Balance API: water complaints in; evidence-backed fields, a schedule check and a traced fault out.

Run from the project root:  python -m uvicorn api.main:app --port 8000 --no-access-log
"""
import json
import secrets
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from . import asr, config, templates_ar
from .extract import check_evidence, extract, fill_gaps
from .localise import Network, analyse
from .pii import apply as apply_mask
from .pii import mask
from .places import Gazetteer
from .schedule import Schedules
from .store import STORED_FIELDS, Store

NETWORK = Network(json.loads((config.DATA / "network.json").read_text(encoding="utf-8")))
SCHEDULES = Schedules(config.DATA / "schedules.json")
GAZETTEER = Gazetteer(config.DATA / "gazetteer.json")
STORE = Store(config.DB_PATH)

ANOMALY_ISSUES = {"no_water", "weak_pressure", "cut_early", "leak_seen"}
SCHEDULE_ISSUES = {"no_water", "weak_pressure", "cut_early"}  # issues a supply turn can explain
_RECEIPT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_clock = {"started": time.monotonic()}
_llm_health = {"checked": 0.0, "available": False}


def now() -> datetime:
    return config.DEMO_NOW + timedelta(seconds=time.monotonic() - _clock["started"])


def iso(when: datetime) -> str:
    return when.isoformat(timespec="seconds")


def _warm_up() -> None:
    # Load the language model first, then Whisper: on an 8 GB card the reverse order can fail.
    extract("ما في مي")
    if config.WHISPER_PRELOAD:
        try:
            asr.get_model()
        except Exception as exc:  # noqa: BLE001
            asr.state["error"] = str(exc)[:200]


@asynccontextmanager
async def lifespan(_: FastAPI):
    STORE.purge_before(iso(now() - timedelta(days=config.RETENTION_DAYS)))
    threading.Thread(target=_warm_up, daemon=True).start()
    yield


app = FastAPI(title="Blue Balance", lifespan=lifespan)


# ---------- pipeline ----------

def _zone_out(zone_id: str | None) -> dict | None:
    if zone_id is None:
        return None
    return {"id": zone_id, "name_ar": NETWORK.name(zone_id), "match": "gazetteer"}


def _public(c: dict) -> dict:
    out = {k: v for k, v in c.items() if k != "zone_id"}
    out["zone"] = _zone_out(c["zone_id"]) or {"id": None, "name_ar": None, "match": "unclear"}
    return out


def process(text: str, channel: str, source: str, ts: datetime | None = None, cached: dict | None = None) -> dict:
    when = ts or now()
    original = text
    # Phones, national IDs, plates and kunyas are masked on the laptop before any model sees the text,
    # so a hosted model never receives them. Replay outputs were recorded on the unmasked text.
    if cached is None:
        text, pre_applied = mask(original, [], keep=GAZETTEER.normalised_aliases)
        result = extract(text)
    else:
        pre_applied = []
        result = {"raw": cached["raw"], "engine": f"{cached['engine']} (replay)", "latency_ms": cached.get("latency_ms", 0), "error": None}

    fields, dropped, pii_spans = check_evidence(text, result["raw"])
    filled_by_rules = fill_gaps(text, fields)
    masked, applied = mask(text, pii_spans, keep=GAZETTEER.normalised_aliases)
    applied = pre_applied + applied
    for f in fields.values():
        f["quote"] = apply_mask(f["quote"], applied)
        if isinstance(f["value"], str):
            f["value"] = apply_mask(f["value"], applied)

    # The place is resolved from the original words in memory; only the masked text is stored.
    place_quote = (result["raw"].get("place_phrase") or {}).get("quote") if fields["place_phrase"]["quote"] else None
    zone_id = GAZETTEER.resolve(place_quote, original)
    receipt = "BB-" + "".join(secrets.choice(_RECEIPT_ALPHABET) for _ in range(4))
    issue = fields["issue"]["value"]

    if zone_id is None:
        status = "unclear_place" if issue in ANOMALY_ISSUES else "other"
        reply = templates_ar.unclear_place(receipt) if status == "unclear_place" else templates_ar.other(receipt)
    elif issue in SCHEDULE_ISSUES and not SCHEDULES.in_turn(zone_id, when):
        status = "explained"
        reply = templates_ar.explained(NETWORK.name(zone_id), SCHEDULES.next_window_ar(zone_id, when), receipt)
    elif issue in ANOMALY_ISSUES and SCHEDULES.in_turn(zone_id, when):
        status = "anomaly"
        reply = templates_ar.anomaly(NETWORK.name(zone_id), receipt)
    else:
        status = "other"
        reply = templates_ar.other(receipt)

    complaint = {
        "receipt": receipt, "ts": iso(when), "channel": channel, "source": source, "text_redacted": masked,
        "fields": fields, "dropped": dropped, "pii_masked": len(applied), "zone_id": zone_id, "status": status,
        "reply_ar": reply, "engine": result["engine"], "latency_ms": result["latency_ms"], "segment_status": None,
    }
    STORE.add(complaint)
    out = _public(complaint)
    out["error"] = result["error"]
    out["filled_by_rules"] = filled_by_rules
    return out


def _window() -> tuple[datetime, list[dict]]:
    t = now()
    since = iso(t - timedelta(hours=config.WINDOW_HOURS))
    return t, [c for c in STORE.all() if c["ts"] >= since]


def _in_turn_now(t: datetime) -> dict[str, bool]:
    return {z: SCHEDULES.in_turn(z, t) for z in NETWORK.zones}


def _kind(segment_id: str) -> str:
    return "none" if segment_id == "none" else NETWORK.nodes[segment_id]["type"]


def _linked(segment_id: str, complaints: list[dict]) -> list[dict]:
    zones = set(NETWORK.downstream_zones(segment_id))
    return [c for c in complaints if c["status"] == "anomaly" and c["zone_id"] in zones]


def analysis() -> dict:
    t, complaints = _window()
    in_turn = _in_turn_now(t)
    anomalies = {z: 0 for z in NETWORK.zones}
    explained = {z: 0 for z in NETWORK.zones}
    for c in complaints:
        if c["zone_id"] in anomalies:
            if c["status"] == "anomaly":
                anomalies[c["zone_id"]] += 1
            elif c["status"] == "explained":
                explained[c["zone_id"]] += 1
    posteriors, hit = analyse(NETWORK, anomalies, in_turn)

    hypotheses = [{
        "segment_id": s, "name_ar": "ما في عطل" if s == "none" else NETWORK.name(s), "kind": _kind(s),
        "posterior": round(p, 3), "zones": [] if s == "none" else NETWORK.downstream_zones(s),
    } for s, p in posteriors[:3]]

    incident = None
    top, top_p = posteriors[0]
    if top != "none" and top_p >= config.INCIDENT_MIN_POSTERIOR:
        quotes = []
        for z in NETWORK.downstream_zones(top):
            for c in [c for c in complaints if c["zone_id"] == z and c["status"] == "anomaly"][:2]:
                quotes.append({"zone_id": z, "quote": c["text_redacted"][:160]})
        incident = {"segment_id": top, "name_ar": NETWORK.name(top), "kind": _kind(top), "posterior": round(top_p, 3),
                    "status": STORE.incident_status(top) or "open", "quotes": quotes}

    busiest = max(NETWORK.zones, key=lambda z: anomalies[z])
    return {
        "window_hours": config.WINDOW_HOURS, "demo_now": iso(t),
        "zones": {z: {"anomalies": anomalies[z], "explained": explained[z], "in_turn": in_turn[z], "hit": hit[z]} for z in NETWORK.zones},
        "heatmap_top": {"zone_id": busiest, "anomalies": anomalies[busiest]} if anomalies[busiest] else None,
        "hypotheses": hypotheses,
        "incident": incident,
    }


# ---------- routes ----------

class ComplaintIn(BaseModel):
    text: str
    channel: str = "text"


class SegmentIn(BaseModel):
    segment_id: str


@app.get("/api/health")
def health() -> dict:
    if time.monotonic() - _llm_health["checked"] > 10:
        try:
            tags = httpx.get(f"{config.OLLAMA_URL}/api/tags", timeout=2).json()
            _llm_health["available"] = any(m["name"] == config.LLM_MODEL for m in tags.get("models", []))
        except Exception:  # noqa: BLE001
            _llm_health["available"] = False
        _llm_health["checked"] = time.monotonic()
    return {
        "ok": True,
        "llm": {
            "model": config.HOSTED_MODEL if config.HOSTED_ON else config.LLM_MODEL,
            "available": (config.HOSTED_ON or _llm_health["available"]) and not config.AI_OFF,
            "license": "Apache-2.0",
            "runs": f"hosted open model, falls back to local {config.LLM_MODEL}" if config.HOSTED_ON else "local (Ollama)",
        },
        "asr": {"model": asr.model_name(), "device": asr.state["device"], "loaded": asr.state["loaded"], "license": "MIT", "error": asr.state["error"]},
        "demo_now": iso(now()),
        "network_name_ar": NETWORK.data.get("name_ar"),
    }


@app.get("/api/network")
def network() -> dict:
    t = now()
    turns = {z: {"in_turn": SCHEDULES.in_turn(z, t), "next_window_ar": SCHEDULES.next_window_ar(z, t)} for z in NETWORK.zones}
    return {"network": NETWORK.data, "schedules": SCHEDULES.turns, "turns": turns, "demo_now": iso(t)}


@app.post("/api/transcribe")
def transcribe(audio: UploadFile = File(...)) -> dict:
    data = audio.file.read(10 * 1024 * 1024 + 1)
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "audio too long")
    try:
        return asr.transcribe(data, prompt=GAZETTEER.prompt_words())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(503, f"speech-to-text failed: {exc}"[:200]) from exc


@app.post("/api/complaints")
def add_complaint(body: ComplaintIn) -> dict:
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "empty complaint")
    if len(text) > config.MAX_TEXT_CHARS:
        raise HTTPException(413, "complaint too long")
    return process(text, "voice" if body.channel == "voice" else "text", "live")


@app.get("/api/complaints")
def list_complaints() -> list[dict]:
    return [_public(c) for c in STORE.all()]


@app.delete("/api/complaints/{receipt}")
def delete_complaint(receipt: str) -> dict:
    if not STORE.delete(receipt):
        raise HTTPException(404, "no complaint with this receipt")
    return {"deleted": True}


@app.get("/api/incidents")
def incidents() -> dict:
    return analysis()


def _set_segment(segment_id: str, status: str, template) -> dict:
    if segment_id not in NETWORK.nodes:
        raise HTTPException(404, "unknown segment")
    _, complaints = _window()
    linked = _linked(segment_id, complaints)
    text = template(NETWORK.name(segment_id))
    STORE.set_incident(segment_id, status, iso(now()))
    STORE.set_segment_status([c["receipt"] for c in linked], status, text)
    return {"segment_id": segment_id, "status": status, "replies": [{"receipt": c["receipt"], "text_ar": text} for c in linked]}


@app.post("/api/incidents/approve")
def approve(body: SegmentIn) -> dict:
    return _set_segment(body.segment_id, "approved", templates_ar.approved)


@app.post("/api/incidents/close")
def close(body: SegmentIn) -> dict:
    return _set_segment(body.segment_id, "closed", templates_ar.closed)


def _replay_items() -> list[dict]:
    lines = (config.DATA / "replay_morning.jsonl").read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


@app.post("/api/replay")
def replay() -> dict:
    items = _replay_items()
    t = now()
    cache = json.loads(config.REPLAY_CACHE.read_text(encoding="utf-8")) if config.REPLAY_CACHE.exists() else None
    if cache:
        for it in items:
            cached = cache["items"].get(it["id"])
            process(it["text"], "text", "replay", ts=t - timedelta(minutes=it["minutes_before_now"]), cached=cached)
        return {"loaded": len(items), "source": "cache", "model": cache["model"]}

    def run_live() -> None:
        for it in items:
            process(it["text"], "text", "replay", ts=t - timedelta(minutes=it["minutes_before_now"]))

    threading.Thread(target=run_live, daemon=True).start()
    return {"loaded": 0, "queued": len(items), "source": "live", "model": config.LLM_MODEL}


@app.post("/api/reset")
def reset() -> dict:
    STORE.reset()
    _clock["started"] = time.monotonic()
    return {"ok": True}


def _public_rows() -> list[dict]:
    complaints = STORE.all()
    incident_segments = [i["segment_id"] for i in STORE.incidents() if i["status"] in ("approved", "closed")]
    rows = []
    for z in NETWORK.zones:
        counts = {
            "anomalies": sum(1 for c in complaints if c["zone_id"] == z and c["status"] == "anomaly"),
            "explained": sum(1 for c in complaints if c["zone_id"] == z and c["status"] == "explained"),
            "incidents": sum(1 for s in incident_segments if z in NETWORK.downstream_zones(s)),
        }
        # Small cells (1-4 complaints) could point at a household, so they are published as "<5".
        suppressed = any(0 < counts[k] < config.MIN_PUBLIC_CELL for k in ("anomalies", "explained"))
        row = {"zone_id": z, "name_ar": NETWORK.name(z), "suppressed": suppressed, "incidents": counts["incidents"]}
        for k in ("anomalies", "explained"):
            row[k] = "<5" if 0 < counts[k] < config.MIN_PUBLIC_CELL else counts[k]
        rows.append(row)
    return rows


@app.get("/api/public")
def public() -> dict:
    return {"rows": _public_rows(), "min_cell": config.MIN_PUBLIC_CELL, "disclaimer_ar": NETWORK.data.get("disclaimer_ar"), "license": "CC BY 4.0"}


@app.get("/api/public.csv")
def public_csv() -> Response:
    lines = ["zone_id,name_ar,anomalies,explained,incidents"]
    lines += [f"{r['zone_id']},{r['name_ar']},{r['anomalies']},{r['explained']},{r['incidents']}" for r in _public_rows()]
    body = "﻿" + "\n".join(lines) + "\n"
    return Response(body, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": "attachment; filename=blue-balance-public.csv"})


@app.get("/api/privacy")
def privacy() -> dict:
    audio_ext = {".webm", ".wav", ".mp3", ".ogg", ".m4a", ".opus"}
    audio_files = sum(1 for p in config.ROOT.joinpath("api").rglob("*") if p.suffix.lower() in audio_ext)
    audio_files += sum(1 for p in config.DATA.rglob("*") if p.suffix.lower() in audio_ext)
    return {
        "complaints_stored": len(STORE.all()),
        "audio_files_on_disk": audio_files,
        "stored_fields": STORED_FIELDS,
        "not_stored": ["audio", "original text", "names", "phone numbers", "plates", "exact location", "IP address", "account"],
        "outbound_hosts": [f"{config.OLLAMA_URL} (Ollama, same machine)"]
        + ([f"{config.HOSTED_BASE_URL} ({config.HOSTED_MODEL}, masked text only)"] if config.HOSTED_ON else []),
        "retention_days": config.RETENTION_DAYS,
    }
