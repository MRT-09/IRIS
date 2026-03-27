import os
import uuid
from datetime import datetime

import cv2

from flask import Blueprint, jsonify, current_app

from models.contact import Contact, ContactImage, ModelVersion
from models.db import db

training_bp = Blueprint("training", __name__)


@training_bp.route("/submit", methods=["POST"])
def submit_training():
    pipeline = current_app.extensions.get("iris_pipeline")
    store = current_app.extensions.get("iris_store")

    if pipeline is None or store is None:
        return jsonify({"error": "pipeline not initialized"}), 503

    contacts = Contact.query.all()
    if not contacts:
        return jsonify({"error": "no contacts to train on"}), 400

    total_embeddings = 0
    errors = []

    for contact in contacts:
        image_records = ContactImage.query.filter_by(contact_id=contact.id).all()
        images = []
        for record in image_records:
            if os.path.exists(record.filepath):
                img = cv2.imread(record.filepath)
                if img is not None:
                    images.append(img)

        if not images:
            errors.append(f"{contact.name}: no readable images")
            continue

        embeddings = pipeline.generate_embeddings(images)
        if embeddings:
            store.add_contact(contact.id, contact.name, embeddings)
            total_embeddings += len(embeddings)
        else:
            errors.append(f"{contact.name}: no faces detected in images")

    version = ModelVersion(
        id=str(uuid.uuid4()),
        trained_at=datetime.utcnow(),
        embedding_path=store._store_path,
        contacts_hash=str(hash(tuple(sorted(c.id for c in contacts)))),
    )
    db.session.add(version)
    db.session.commit()

    return jsonify({
        "status": "trained",
        "contacts": len(contacts),
        "embeddings": total_embeddings,
        "errors": errors,
    })


@training_bp.route("/status", methods=["GET"])
def get_status():
    store = current_app.extensions.get("iris_store")
    if store is None:
        return jsonify({"state": "unavailable"})

    contacts = store.list_contacts()
    return jsonify({
        "state": "ready" if contacts else "untrained",
        "contacts": len(contacts),
        "embeddings": sum(c["embeddings_count"] for c in contacts),
    })
