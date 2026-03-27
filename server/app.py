import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, Response, stream_with_context

from config import CONTACTS_DIR, DATA_DIR, DETECTION_COOLDOWN_SECONDS
from models.db import init_db
from blueprints.contacts import contacts_bp
from blueprints.training import training_bp
from blueprints.stream import stream_bp, get_latest_frame
from blueprints.notify import notify_bp


def create_app():
    app = Flask(__name__)

    init_db(app)

    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(CONTACTS_DIR, exist_ok=True)

    from core.models.embedding_store import EmbeddingStore
    from core.services.face_recognition import FaceRecognitionPipeline
    from core.services.cooldown import CooldownTracker

    store = EmbeddingStore()
    pipeline = FaceRecognitionPipeline(store)
    cooldown = CooldownTracker(cooldown_seconds=DETECTION_COOLDOWN_SECONDS)

    app.extensions["iris_store"] = store
    app.extensions["iris_pipeline"] = pipeline
    app.extensions["iris_cooldown"] = cooldown

    app.register_blueprint(contacts_bp, url_prefix="/api/contacts")
    app.register_blueprint(training_bp, url_prefix="/api/training")
    app.register_blueprint(stream_bp, url_prefix="/api/stream")
    app.register_blueprint(notify_bp, url_prefix="/api/notify")

    @app.route("/video_feed")
    def video_feed():
        def generate():
            while True:
                frame = get_latest_frame()
                if frame:
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n"
                        + frame
                        + b"\r\n"
                    )
                else:
                    time.sleep(0.05)

        return Response(
            stream_with_context(generate()),
            mimetype="multipart/x-mixed-replace; boundary=frame",
        )

    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=8000, threaded=True)
