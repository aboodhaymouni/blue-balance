"""Arabic text helpers: normalisation for matching places, and a quote check that never rewrites the citizen's words."""
import re

_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")  # harakat and tatweel
_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def normalise(text: str) -> str:
    """Loose form for matching only (alef forms, ta marbuta, ya, digits, spacing). Never shown or stored."""
    t = _DIACRITICS.sub("", text).translate(_DIGITS)
    t = re.sub("[إأآٱ]", "ا", t)
    t = t.replace("ة", "ه").replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", t).strip().lower()


def _squash(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def find_quote(text: str, quote: str | None) -> bool:
    """True when the quote is in the text exactly, or with different spacing. Letters are never normalised."""
    if not quote or not quote.strip():
        return False
    return quote in text or _squash(quote) in _squash(text)
