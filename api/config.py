"""Settings for the Blue Balance API, read from the environment with demo-safe defaults."""
import os
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DB_PATH = Path(os.environ.get("BB_DB", str(ROOT / "api" / "blue_balance.db")))
REPLAY_CACHE = DATA / "replay_cache.json"

# Open-weight language model, served locally by Ollama.
OLLAMA_URL = os.environ.get("BB_OLLAMA_URL", "http://127.0.0.1:11434")
LLM_MODEL = os.environ.get("BB_MODEL", "qwen2.5:7b")
LLM_NUM_CTX = int(os.environ.get("BB_NUM_CTX", "2048"))  # small context keeps the 7B model's VRAM low
LLM_TIMEOUT_S = float(os.environ.get("BB_LLM_TIMEOUT", "90"))
AI_OFF = os.environ.get("BB_AI", "").lower() == "off"

# Open-weight speech-to-text (faster-whisper). Falls back to CPU if CUDA cannot load.
# large-v3-turbo needs about 1 GB of VRAM in int8_float16, so it fits beside qwen2.5:7b on an 8 GB card.
WHISPER_MODEL = os.environ.get("BB_WHISPER", "mobiuslabsgmbh/faster-whisper-large-v3-turbo")
WHISPER_DEVICE = os.environ.get("BB_WHISPER_DEVICE", "cuda")
WHISPER_COMPUTE = os.environ.get("BB_WHISPER_COMPUTE", "int8_float16")
WHISPER_PRELOAD = os.environ.get("BB_WHISPER_PRELOAD", "1") == "1"

# Demo clock: Saturday 10:00 plus the real seconds since the server started.
DEMO_NOW = datetime.fromisoformat(os.environ.get("BB_DEMO_NOW", "2026-10-24T10:00:00+03:00"))

# Localiser.
WINDOW_HOURS = 6
MIN_ZONE_ANOMALIES = 2      # a zone counts as "complaining" at this many in-turn complaints in the window
P_HIT = 0.8                 # chance a zone downstream of a faulty segment complains
P_BG = 0.05                 # chance a healthy zone complains anyway
PRIOR_NONE = 0.5            # prior on "no fault"; the rest is shared by all segments
INCIDENT_MIN_POSTERIOR = 0.5

MIN_PUBLIC_CELL = 5
RETENTION_DAYS = 30
MAX_TEXT_CHARS = 1000
