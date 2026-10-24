# Blue Balance · بلو بالانس

**Every «ما في مي» is a sensor.** Citizens complain about water by voice or text in Jordanian Arabic. Open-weight models running on one laptop turn each complaint into fields backed by the citizen's own words. Complaints from zones outside their supply turn get the real schedule back at once. Complaints that arrive during a zone's turn are traced up the pipe tree to the main where the water went missing. An engineer approves, and every linked citizen gets an answer.

Built at Hacktoberfest Hack Day Amman (JOSA × MLH), 24 October 2026. Track: **Open Governance & Public Impact**. Licence: **Apache-2.0** (code), **CC BY 4.0** (data).

> كل «ما في مي» حسّاس. المواطن بيشتكي بصوته أو بالكتابة، ونماذج مفتوحة على اللابتوب بتحوّل الشكوى لحقول، وكل حقل معه كلام المواطن الحرفي. إذا منطقته مش دورها بيوصله جدوله فورًا، وإذا دورها بتنحسب الشكوى على شجرة الأنابيب لحد الخط اللي ضاعت فيه المية. المهندس بيعتمد، والمواطن بيوصله رد.

## Why
- Miyahuna's control centre received 207,948 "no water" complaints in 2025 (Miyahuna Annual Report 2025).
- Only 2.3% of Amman subscribers had round-the-clock supply in 2022 (Miyahuna KPIs, opendata.gov.jo). "No water" is normal outside your turn and a fault during it.
- Published supply hours are scheduled, not measured (MWI UPMU 2024).
- In July 2026, about 3,500 m³ a day being drawn from mains in Aqaba was uncovered after disruptions to supply were reported (Petra, 21 Jul 2026). The complaints were the sensor.

## How it works
| Step | What does it | Open model? |
|---|---|---|
| Voice → text | Whisper large-v3 (MIT) via faster-whisper, on the laptop. Audio stays in memory and is deleted. | yes |
| Text → fields | Qwen2.5-7B-Instruct (Apache-2.0) via Ollama, JSON-schema constrained, temperature 0. Every field carries a quote; the server drops any field whose quote is not in the text. | yes |
| Personal data | The model lists names and numbers; regex backstops phones, national IDs, plates. Only masked text is stored. | yes |
| Place → zone | Gazetteer of real place names (normalised match). The model never picks a location. | no |
| Schedule check | Zone in its turn? If not, the citizen gets the next window. | no |
| Fault tracing | Bayesian score over pipe segments against a "no fault" hypothesis, using only in-turn zones. | no |
| Replies | Arabic templates. The model never writes to citizens. | no |

AI for language, a gazetteer for places, maths for location, templates for words.

## Run it (Windows, NVIDIA GPU with 8 GB)
```powershell
# 1. Ollama with one request slot (keeps qwen2.5:7b near 5.5 GB so Whisper fits beside it)
ollama pull qwen2.5:7b
powershell -ExecutionPolicy Bypass -File .\scripts\start-ollama.ps1

# 2. API on :8000
python -m pip install -r api\requirements.txt
powershell -ExecutionPolicy Bypass -File .\scripts\start-api.ps1

# 3. Web on :5173
cd web; npm install; npm run dev
```
Open http://localhost:5173 (citizen), `#/ops` (control room), `#/public` (open data), `#/privacy`.

Settings (environment): `BB_MODEL` (default `qwen2.5:7b`), `BB_WHISPER` (`large-v3`), `BB_WHISPER_DEVICE` (`cuda`, falls back to `cpu`), `BB_AI=off` (keyword fallback only), `BB_DEMO_NOW` (demo clock start, default Saturday 2026-10-24 10:00).

## Checks
```powershell
python -m unittest api.tests.test_core -v      # quotes, masking, schedule, localiser (no model needed)
python eval/smoke.py                           # three complaints through the real model
python eval/run_eval.py --set test --engine llm   # held-out set; writes eval/results/test-llm.json
python eval/run_eval.py --set test --engine rules # keyword baseline on the same set
python eval/build_replay_cache.py              # records the morning stream for the Replay button
```

## Measured today (held-out set, 20 complaints, RTX 3060 8 GB)
| Engine | Issue correct | Stated values correct | Invented fields | Wrong values | Zone correct | Personal data masked | Median latency |
|---|---|---|---|---|---|---|---|
| Keyword rules (baseline) | 14/20 | 14/37 | 0 | 0 | 18/18 | 2/2 | instant |
| qwen2.5:7b alone | 14/20 | 28/37 | 3 | 1 | 18/18 | 2/2 | 3.5 s |
| **qwen2.5:7b + rules fill (shipped)** | **17/20** | **31/37** | 3 | 1 | 18/18 | 2/2 | 3.2 s |

Results are in `eval/results/`. The test set was written separately from the prompt, by the team; it is small, so treat these as a first measurement.

## Real vs simulated
| Real | Simulated, and labelled on screen |
|---|---|
| Open models running locally, no cloud API | The pipe network, the schedules and the supply zones (neighbourhood names are real) |
| Evidence check, masking, schedule check, fault tracing | All complaints (written by the team; no real person's data) |
| Measured scores in eval/results | The fault the replay stream represents |

The fault tracer was validated on our own tree and simulated complaints. Testing it on a public hydraulic benchmark (EPANET / WNTR, L-Town) is the next step.

## Privacy
- All inference runs on the laptop. The only outbound host is Ollama on 127.0.0.1.
- Anonymous by default: no account, no phone number. A receipt code lets the citizen delete the complaint.
- Audio is never written to disk. Names, phone numbers, national IDs and plates are masked before storage.
- The public table hides any cell with fewer than 5 complaints.
- Retention: 30 days, then aggregates only. Designed against Jordan's Personal Data Protection Law No. 24 of 2023; not legally reviewed.
- It records observations about pipes, never accusations about people. Every fault stays a hypothesis until an engineer approves it.

## Prior work
Blue Balance grows out of the team's earlier project Missing Blue (AI Quest 2026), which looked for water loss with satellite imagery. The code here was written at this event.
