"""SQLite storage. Only redacted text and fields are stored: no audio, no names, no phone numbers, no IP addresses."""
import json
import sqlite3
import threading
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS complaints (
  receipt TEXT PRIMARY KEY, ts TEXT NOT NULL, channel TEXT NOT NULL, source TEXT NOT NULL,
  text_redacted TEXT NOT NULL, fields TEXT NOT NULL, dropped TEXT NOT NULL, pii_masked INTEGER NOT NULL,
  zone_id TEXT, status TEXT NOT NULL, reply_ar TEXT NOT NULL, engine TEXT NOT NULL, latency_ms INTEGER NOT NULL,
  segment_status TEXT
);
CREATE TABLE IF NOT EXISTS incidents (
  segment_id TEXT PRIMARY KEY, status TEXT NOT NULL, ts TEXT NOT NULL
);
"""
STORED_FIELDS = ["receipt", "ts", "channel", "text_redacted", "fields", "zone_id", "status", "reply_ar", "engine", "segment_status"]


class Store:
    def __init__(self, path: Path):
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(_SCHEMA)

    def add(self, c: dict) -> None:
        with self.lock:
            self.db.execute(
                "INSERT INTO complaints VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (c["receipt"], c["ts"], c["channel"], c["source"], c["text_redacted"], json.dumps(c["fields"], ensure_ascii=False),
                 json.dumps(c["dropped"], ensure_ascii=False), c["pii_masked"], c["zone_id"], c["status"], c["reply_ar"],
                 c["engine"], c["latency_ms"], c.get("segment_status")),
            )
            self.db.commit()

    def all(self) -> list[dict]:
        with self.lock:
            rows = self.db.execute("SELECT * FROM complaints ORDER BY ts DESC").fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["fields"], d["dropped"] = json.loads(d["fields"]), json.loads(d["dropped"])
            out.append(d)
        return out

    def delete(self, receipt: str) -> bool:
        with self.lock:
            cur = self.db.execute("DELETE FROM complaints WHERE receipt = ?", (receipt,))
            self.db.commit()
            return cur.rowcount > 0

    def set_segment_status(self, receipts: list[str], status: str, reply_ar: str) -> None:
        """Mark linked complaints and replace their reply, so the citizen sees the outcome on their receipt."""
        with self.lock:
            self.db.executemany("UPDATE complaints SET segment_status = ?, reply_ar = ? WHERE receipt = ?",
                                [(status, reply_ar, r) for r in receipts])
            self.db.commit()

    def incident_status(self, segment_id: str) -> str | None:
        with self.lock:
            row = self.db.execute("SELECT status FROM incidents WHERE segment_id = ?", (segment_id,)).fetchone()
        return row["status"] if row else None

    def set_incident(self, segment_id: str, status: str, ts: str) -> None:
        with self.lock:
            self.db.execute("INSERT OR REPLACE INTO incidents VALUES (?,?,?)", (segment_id, status, ts))
            self.db.commit()

    def incidents(self) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.db.execute("SELECT * FROM incidents").fetchall()]

    def purge_before(self, ts: str) -> None:
        with self.lock:
            self.db.execute("DELETE FROM complaints WHERE ts < ?", (ts,))
            self.db.commit()

    def reset(self) -> None:
        with self.lock:
            self.db.execute("DELETE FROM complaints")
            self.db.execute("DELETE FROM incidents")
            self.db.commit()
