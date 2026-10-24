"""Resolve the quoted place words to a supply zone with the gazetteer. The model never picks a zone."""
import json
from pathlib import Path

from .arabic import normalise


class Gazetteer:
    def __init__(self, path: Path):
        entries = json.loads(path.read_text(encoding="utf-8"))
        self.aliases: list[tuple[str, str]] = [(normalise(a), e["zone"]) for e in entries for a in e["aliases"] if a.strip()]
        self.aliases.sort(key=lambda pair: -len(pair[0]))  # longest alias wins
        self.normalised_aliases = [alias for alias, _ in self.aliases]

    def resolve(self, *texts: str | None) -> str | None:
        """Try each text in order (the quoted place first, then the whole complaint)."""
        for text in texts:
            if not text:
                continue
            haystack = normalise(text)
            for alias, zone in self.aliases:
                if alias in haystack:
                    return zone
        return None

    def prompt_words(self, limit: int = 60) -> str:
        """Place names to bias speech-to-text towards local spellings."""
        seen: list[str] = []
        for alias, _ in sorted(self.aliases, key=lambda pair: len(pair[0])):
            if alias not in seen:
                seen.append(alias)
        return "، ".join(seen[:limit])
