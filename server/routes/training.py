import cv2
import numpy as np
from flask import Blueprint, jsonify

import db
import pipeline

training_bp = Blueprint("training", __name__)


@training_bp.route("/submit", methods=["POST"])
def submit_training():
    contacts = db.list_contacts()
    if not contacts:
        return jsonify({"error": "no contacts to train on"}), 400

    total = 0
    errors = []

    for contact in contacts:
        blobs = db.get_images(contact["id"])
        images = []
        for blob in blobs:
            arr = np.frombuffer(blob, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is not None:
                images.append(img)

        if not images:
            errors.append(f"{contact['name']}: no readable images")
            continue

        try:
            embeddings = pipeline.generate_embeddings(images)
        except Exception as e:
            errors.append(f"{contact['name']}: pipeline error — {e}")
            continue
        if embeddings:
            db.save_embeddings(contact["id"], embeddings)
            total += len(embeddings)
        else:
            errors.append(f"{contact['name']}: no faces detected")

    return jsonify({
        "status": "trained",
        "contacts": len(contacts),
        "embeddings": total,
        "errors": errors,
    })


@training_bp.route("/status", methods=["GET"])
def get_status():
    all_emb = db.get_all_embeddings()
    contact_ids = {cid for cid, _, _ in all_emb}
    return jsonify({
        "state": "ready" if all_emb else "untrained",
        "contacts": len(contact_ids),
        "embeddings": len(all_emb),
    })
