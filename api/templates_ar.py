"""Every word sent to a citizen comes from these templates. The model never writes to citizens."""


def explained(zone_name: str, next_window_ar: str, receipt: str) -> str:
    return f"وصلت شكواك (رقمها {receipt}). هاد مش عطل: منطقة {zone_name} مش دورها هلأ. دوركم الجاي: {next_window_ar}."


def anomaly(zone_name: str, receipt: str) -> str:
    return f"وصلت شكواك (رقمها {receipt}). منطقة {zone_name} بدورها هلأ، فعم نفحص إذا في عطل على الخط المغذّي إلها."


def unclear_place(receipt: str) -> str:
    return f"وصلت شكواك (رقمها {receipt}). ما قدرنا نعرف المنطقة: شو أقرب مسجد أو مدرسة أو دوّار إلك؟"


def other(receipt: str) -> str:
    return f"وصلت شكواك (رقمها {receipt}) وتحوّلت للقسم المختص."


def approved(segment_name: str) -> str:
    return f"لقينا عطل محتمل على «{segment_name}» المغذّي لمنطقتكم، وتحوّل لفرقة صيانة."


def closed(segment_name: str) -> str:
    return f"تم إصلاح العطل على «{segment_name}». إذا لسا ما في مي، ردّ على هالرسالة برقم شكواك."
