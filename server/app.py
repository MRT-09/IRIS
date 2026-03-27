import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, jsonify

from config import CONTACTS_DIR, DATA_DIR, DETECTION_COOLDOWN_SECONDS
from models.db import init_db
from blueprints.contacts import contacts_bp
from blueprints.training import training_bp
from blueprints.stream import stream_bp
from blueprints.notify import notify_bp


def _startup_sync(app, store, pipeline):
    """
    Reconcile the embedding store with the database on every startup.

    1. Remove embeddings for contacts that no longer exist in the DB
       (handles contacts deleted while the server was down).
    2. Auto-retrain from DB images if the store is empty but the DB has
       contacts (handles deleted pickle, first run after data import, etc.).
    """
    import cv2
    from models.contact import Contact, ContactImage

    with app.app_context():
        db_contacts = {c.id: c for c in Contact.query.all()}
        store_ids   = {e["contact_id"] for e in store.list_contacts()}

        # 1. Purge embeddings for contacts no longer in DB
        for stale_id in store_ids - db_contacts.keys():
            store.remove_contact(stale_id)

        # 2. Auto-retrain if store is now empty but DB has contacts
        if db_contacts and not store.list_contacts():
            for contact in db_contacts.values():
                images = []
                for record in ContactImage.query.filter_by(contact_id=contact.id).all():
                    if os.path.exists(record.filepath):
                        img = cv2.imread(record.filepath)
                        if img is not None:
                            images.append(img)
                if images:
                    embeddings = pipeline.generate_embeddings(images)
                    if embeddings:
                        store.add_contact(contact.id, contact.name, embeddings)


def create_app():
    app = Flask(__name__)

    init_db(app)

    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(CONTACTS_DIR, exist_ok=True)

    from core.models.embedding_store import EmbeddingStore
    from core.services.face_recognition import FaceRecognitionPipeline
    from core.services.cooldown import CooldownTracker

    store    = EmbeddingStore()
    pipeline = FaceRecognitionPipeline(store)
    cooldown = CooldownTracker(cooldown_seconds=DETECTION_COOLDOWN_SECONDS)

    app.extensions["iris_store"]    = store
    app.extensions["iris_pipeline"] = pipeline
    app.extensions["iris_cooldown"] = cooldown

    @app.route("/")
    def health():
        return jsonify({"status": "ok"})

    app.register_blueprint(contacts_bp, url_prefix="/api/contacts")
    app.register_blueprint(training_bp, url_prefix="/api/training")
    app.register_blueprint(stream_bp,   url_prefix="/api/stream")
    app.register_blueprint(notify_bp,   url_prefix="/api/notify")

    _startup_sync(app, store, pipeline)

    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=8000, threaded=True)
