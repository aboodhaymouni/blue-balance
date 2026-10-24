# Blue Balance — contracts (shared by api/, data/ and web/)

Blue Balance turns Jordanian-Arabic water complaints ("ما في مي") into a sensor:
1. A citizen sends a complaint by voice or text (anonymous by default).
2. Open-weight models running on the laptop extract fields; every field carries the citizen's exact words (a quote) or stays empty.
3. If the citizen's zone is outside its supply turn, the complaint is "explained" and the citizen gets the next supply window.
4. Complaints that arrive during a zone's turn are anomalies. They are traced up the pipe tree to the segment (main or zone feeder) most likely at fault.
5. An engineer approves; linked citizens get a template reply. The model never writes to citizens.

The pipe network and the schedules are ILLUSTRATIVE (real neighbourhood names, invented pipes). Every screen that shows them says so.

## Folder layout
```
api/        FastAPI backend (Python 3.10), port 8000
data/       network.json, schedules.json, gazetteer.json, complaints_*.jsonl, replay_morning.jsonl
eval/       evaluation and replay-cache scripts
web/        React + Vite + TypeScript + Tailwind v4 frontend, port 5173, proxies /api to 8000
scripts/    PowerShell helpers
```

## data/network.json
```json
{
  "name_ar": "شبكة توضيحية — شرق عمّان",
  "disclaimer_ar": "أسماء الأحياء حقيقية، أما الأنابيب والجداول فمُخترعة للعرض.",
  "nodes": [
    {"id": "R1", "type": "reservoir", "name_ar": "الخزان التجريبي", "parent": null},
    {"id": "M1", "type": "main", "name_ar": "الخط الرئيسي ١", "parent": "R1", "diameter_mm": 400},
    {"id": "Z01", "type": "zone", "name_ar": "جبل النزهة", "parent": "M1", "subscribers": 5200}
  ]
}
```
- Exactly 1 reservoir `R1`, 3 mains `M1..M3`, 10 zones `Z01..Z10`. Every zone's parent is a main.
- Zone ids are also feeder-segment ids (a fault "on Z05" means the zone's own feeder).

## data/schedules.json
Weekly supply turns per zone, local time (Asia/Amman). Days are `sat sun mon tue wed thu fri`.
```json
{ "Z01": [ {"day": "sat", "start": "06:00", "end": "20:00"}, {"day": "tue", "start": "06:00", "end": "20:00"} ] }
```

## The demo clock
The backend runs on a demo clock so the demo is the same every time:
`DEMO_NOW = 2026-10-24T10:00:00+03:00` (Saturday 10:00) plus the real seconds since the server started.
- Zones under **M2** (Z04-Z07) are IN turn on Saturday 06:00-20:00.
- Zones under **M3** (Z08-Z10) are OUT of turn on Saturday (their turns are other days).
- Zones under **M1** (Z01-Z03): Z01 and Z02 in turn on Saturday, Z03 not.

## data/gazetteer.json
```json
[ {"zone": "Z01", "aliases": ["جبل النزهة", "النزهة", "دوار النزهة", "مسجد ..."]} ]
```
Real place names and landmarks per zone, 4-8 aliases each. Matching is done after Arabic normalisation (see api/places.py).

## Complaint datasets (JSONL, one object per line)
```json
{"id": "D01", "text": "من امبارح ما في مي عنا بجبل النزهة والجيران كمان، ودورنا اليوم", "minutes_before_now": 240,
 "label": {"issue": "no_water", "since": "yesterday", "turn_claim": true, "neighbours_too": true,
           "tanker_seen": false, "place_phrase": "جبل النزهة", "zone": "Z01", "pii": []}}
```
- `complaints_dev.jsonl`: 30 items, used to tune the prompt.
- `complaints_test.jsonl`: 20 held-out items, written without seeing the prompt.
- `replay_morning.jsonl`: 30 items with `minutes_before_now` (0-300). Designed so that: Z04-Z07 (all under M2, all in turn) produce anomaly complaints (Z05 the most, Z04/Z06 a few, Z07 one or none); Z08-Z10 produce out-of-turn "no water" complaints (explained); one or two noise complaints elsewhere (billing, dirty water). Result: the heatmap points at Z05, the tree points at M2.
- `label.place_phrase` is the exact substring of `text` naming the place, or null.
- `label.pii` lists exact substrings that are personal data (names, phone numbers, plates).
- Texts are Jordanian dialect, short (1-3 sentences), varied, some with negation ("مش مقطوعة بس ضعيفة"), some with English words, a few with a name or a phone number. No real person's data.

## Extraction fields (every field is {"value": ..., "quote": ...}; both null when not stated)
| field | values |
|---|---|
| issue | no_water, weak_pressure, cut_early, leak_seen, dirty_water, billing, other |
| since | today, yesterday, two_three_days, week_plus |
| turn_claim | true when the citizen says it is their supply turn now (دورنا اليوم) |
| neighbours_too | true when neighbours/the whole street are affected (كل الحارة، الجيران كمان) |
| tanker_seen | true when a water tanker is mentioned drawing water |
| place_phrase | the words naming the place |
plus `pii_spans`: list of exact substrings that are personal data.

## HTTP API (all JSON, prefix /api)
- `GET /api/health` → `{ok, llm: {model, available}, asr: {model, device, loaded}, demo_now, network_name_ar}`
- `GET /api/network` → `{network, schedules, turns: {zone_id: {in_turn, next_window_ar}}, demo_now}`
- `POST /api/transcribe` (multipart, field `audio`) → `{text, seconds, model, audio_deleted: true}`
- `POST /api/complaints` body `{text, channel: "text"|"voice"}` → Complaint
- `GET /api/complaints` → `Complaint[]` (newest first)
- `DELETE /api/complaints/{receipt}` → `{deleted: true}`
- `GET /api/incidents` → Analysis
- `POST /api/incidents/approve` body `{segment_id}` → `{segment_id, replies: [{receipt, text_ar}]}`
- `POST /api/incidents/close` body `{segment_id}` → `{segment_id, replies: [{receipt, text_ar}]}`
- `POST /api/replay` → `{loaded: n, source: "cache"|"live", model}` (loads replay_morning through the pipeline; uses data/replay_cache.json when present)
- `POST /api/reset` → `{ok: true}`
- `GET /api/public` → `{rows: [{zone_id, name_ar, anomalies, explained, incidents, suppressed}], min_cell: 5, disclaimer_ar}`
- `GET /api/public.csv` → CSV of the same rows (suppressed cells shown as "<5")
- `GET /api/privacy` → `{complaints_stored, audio_files_on_disk, stored_fields, outbound_hosts, retention_days}`

### Complaint
```json
{
  "receipt": "BB-7Q2K", "ts": "2026-10-24T10:03:12+03:00", "channel": "text",
  "text_redacted": "من امبارح ما في مي ... [اسم] ...",
  "fields": {"issue": {"value": "no_water", "quote": "ما في مي"}, "since": {"value": null, "quote": null}},
  "dropped": [{"field": "since", "reason": "quote_not_found"}],
  "pii_masked": 1,
  "zone": {"id": "Z05", "name_ar": "...", "match": "gazetteer"|"unclear"},
  "status": "anomaly"|"explained"|"other"|"unclear_place",
  "reply_ar": "...", "engine": "qwen2.5:7b"|"rules", "latency_ms": 9400,
  "segment_status": null|"approved"|"closed"
}
```

### Analysis
```json
{
  "window_hours": 6, "demo_now": "...",
  "zones": {"Z05": {"anomalies": 6, "explained": 0, "in_turn": true, "hit": true}},
  "heatmap_top": {"zone_id": "Z05", "anomalies": 6},
  "hypotheses": [{"segment_id": "M2", "name_ar": "...", "kind": "main"|"zone"|"reservoir"|"none", "posterior": 0.91, "zones": ["Z04","Z05","Z06","Z07"]}],
  "incident": {"segment_id": "M2", "posterior": 0.91, "status": "open"|"approved"|"closed", "quotes": [{"zone_id": "Z05", "quote": "..."}]} | null
}
```
`hypotheses` is the top 3 including the "none" (no fault) hypothesis.
