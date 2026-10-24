"""Personal-data masking: spans the model found (kept only if they exist in the text) plus regex backstops for numbers."""
import re

from .arabic import find_quote, normalise

_D = "[0-9٠-٩]"
_AR = "[ء-ي]"
# Kunyas ("ابو محمد", "أم علي", optionally a family name after): a backstop for names the model misses.
KUNYA = re.compile(rf"(?<!{_AR})(?:ابو|أبو|ام|أم)\s+{_AR}{{2,}}(?:\s+ال{_AR}{{2,}})?")
# Jordanian mobiles: 07[789]XXXXXXX, optionally +962 / 00962, digits may be Arabic-Indic, spaces or dashes allowed.
PHONE = re.compile(rf"(?<![0-9٠-٩])(?:\+962|00962|0|٠)?\s?[7٧][789٧٨٩](?:[\s-]?{_D}){{7}}(?![0-9٠-٩])")
NATIONAL_ID = re.compile(rf"(?<![0-9٠-٩])[29٢٩]{_D}{{9}}(?![0-9٠-٩])")
PLATE = re.compile(rf"(?<![0-9٠-٩]){_D}{{1,2}}\s?-\s?{_D}{{3,6}}(?![0-9٠-٩])")

LABELS = {"name": "[اسم]", "phone": "[هاتف]", "id": "[رقم وطني]", "plate": "[لوحة]"}


def mask(text: str, model_spans: list[str], keep: list[str] = ()) -> tuple[str, list[tuple[str, str]]]:
    """Return the masked text and the (original, replacement) pairs applied, longest first.

    `keep` holds normalised place names (the gazetteer): a landmark such as "مسجد أبو درويش" is not a person.
    """
    def is_place(span: str) -> bool:
        n = normalise(span)
        return any(n in alias or alias in n for alias in keep)

    pairs: dict[str, str] = {}
    for pattern, label in ((PHONE, "phone"), (NATIONAL_ID, "id"), (PLATE, "plate"), (KUNYA, "name")):
        for m in pattern.finditer(text):
            if label != "name" or not is_place(m.group(0)):
                pairs[m.group(0).strip()] = LABELS[label]
    for span in model_spans:
        span = span.strip()
        # Only spans that really occur, are not places, and are not tiny fragments that would blank out ordinary words.
        already_masked = any(label in span for label in LABELS.values())
        if len(span) >= 2 and find_quote(text, span) and span not in pairs and not is_place(span) and not already_masked:
            pairs[span] = LABELS["phone"] if re.search(_D + "{6,}", span) else LABELS["name"]
    applied = sorted(pairs.items(), key=lambda kv: -len(kv[0]))
    masked = text
    for original, replacement in applied:
        masked = masked.replace(original, replacement)
    return masked, applied


def apply(text: str | None, applied: list[tuple[str, str]]) -> str | None:
    """Apply the same replacements to a quote so it still matches the masked text."""
    if text is None:
        return None
    for original, replacement in applied:
        text = text.replace(original, replacement)
    return text
