"""Download the Whisper large-v3-turbo CTranslate2 weights (MIT) once, before the demo.

Usage: python eval/download_whisper.py [target_dir]   (default F:\\models\\whisper-large-v3-turbo, off the full C: drive)
Then point the API at it with BB_WHISPER=<target_dir> (scripts\\start-api.ps1 does this when the folder exists).
"""
import sys

from huggingface_hub import snapshot_download

target = sys.argv[1] if len(sys.argv) > 1 else r"F:\models\whisper-large-v3-turbo"
print(snapshot_download("mobiuslabsgmbh/faster-whisper-large-v3-turbo", local_dir=target))
