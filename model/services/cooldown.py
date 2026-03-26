import time
import threading

from ..config import COOLDOWN_SECONDS


class CooldownTracker:
    def __init__(self, cooldown_seconds: int = COOLDOWN_SECONDS):
        self._cooldown = cooldown_seconds
        self._last_announced: dict[str, float] = {}
        self._lock = threading.Lock()

    def is_in_cooldown(self, contact_id: str) -> bool:
        with self._lock:
            last = self._last_announced.get(contact_id)
            if last is None:
                return False
            return (time.time() - last) < self._cooldown

    def mark_announced(self, contact_id: str):
        with self._lock:
            self._last_announced[contact_id] = time.time()

    def filter_detections(self, detections: list[dict]) -> list[dict]:
        active = []
        for det in detections:
            cid = det["contact_id"]
            if not self.is_in_cooldown(cid):
                self.mark_announced(cid)
                active.append(det)
        return active

    def reset(self, contact_id: str | None = None):
        with self._lock:
            if contact_id:
                self._last_announced.pop(contact_id, None)
            else:
                self._last_announced.clear()
