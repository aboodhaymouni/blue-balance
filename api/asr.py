"""Speech-to-text with an open-weight Whisper model (faster-whisper). Audio stays in memory and is never written to disk."""
import io
import os
import threading
import time

from . import config

_lock = threading.Lock()
_model = None
state = {"model": config.WHISPER_MODEL, "device": None, "loaded": False, "error": None}


def _add_cuda_dlls() -> None:
    # On Windows, CTranslate2 finds cuBLAS/cuDNN through torch's bundled DLLs.
    try:
        import torch

        lib = os.path.join(os.path.dirname(torch.__file__), "lib")
        if os.path.isdir(lib):
            os.add_dll_directory(lib)
            os.environ["PATH"] = lib + os.pathsep + os.environ.get("PATH", "")
    except Exception:  # noqa: BLE001 - CPU fallback below handles it
        pass


def get_model():
    global _model
    with _lock:
        if _model is not None:
            return _model
        from faster_whisper import WhisperModel

        if config.WHISPER_DEVICE == "cuda":
            _add_cuda_dlls()
            try:
                _model = WhisperModel(config.WHISPER_MODEL, device="cuda", compute_type=config.WHISPER_COMPUTE)
                state.update(device="cuda", loaded=True, error=None)
                return _model
            except Exception as exc:  # noqa: BLE001
                state["error"] = f"cuda: {exc}"[:200]
        try:
            _model = WhisperModel(config.WHISPER_MODEL, device="cpu", compute_type="int8")
        except Exception as exc:  # noqa: BLE001
            state["error"] = f"{state['error'] or ''} | cpu: {exc}"[:300]
            raise
        state.update(device="cpu", loaded=True)
        return _model


def transcribe(audio: bytes, prompt: str | None = None) -> dict:
    started = time.perf_counter()
    buffer = io.BytesIO(audio)
    segments, info = get_model().transcribe(buffer, language="ar", vad_filter=True, beam_size=1, initial_prompt=prompt)
    text = " ".join(s.text.strip() for s in segments).strip()
    buffer.close()
    del audio
    return {"text": text, "seconds": round(time.perf_counter() - started, 2), "audio_seconds": round(info.duration, 1),
            "model": model_name(), "device": state["device"], "audio_deleted": True}


def model_name() -> str:
    # Works for a hub id ("org/faster-whisper-large-v3-turbo") or a local folder ("F:\models\whisper-large-v3-turbo").
    base = config.WHISPER_MODEL.replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]
    return "whisper " + base.replace("faster-whisper-", "").replace("whisper-", "")
