import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, jsonify

import db
from config import DETECTION_COOLDOWN_SECONDS
from routes.contacts import contacts_bp
from routes.training import training_bp
from routes.stream import stream_bp
from routes.notify import notify_bp


class CooldownTracker:
    def __init__(self, cooldown_seconds=DETECTION_COOLDOWN_SECONDS):
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


def create_app(test_config=None):
    app = Flask(__name__)

    if test_config:
        app.config.update(test_config)

    db.init_db(app)

    app.extensions["iris_cooldown"] = CooldownTracker()

    @app.route("/")
    def health():
        return jsonify({"status": "ok"})

    app.register_blueprint(contacts_bp, url_prefix="/api/contacts")
    app.register_blueprint(training_bp, url_prefix="/api/training")
    app.register_blueprint(stream_bp,   url_prefix="/api/stream")
    app.register_blueprint(notify_bp,   url_prefix="/api/notify")

    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=8000, threaded=True)
