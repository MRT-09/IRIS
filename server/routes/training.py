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
        image_records = db.list_image_records(contact["id"])
        if not image_records:
            continue

        processed_ids = db.get_processed_image_ids(contact["id"])

        for record in image_records:
            if record["id"] in processed_ids:
                continue

            blob = db.get_image(record["id"])
            if blob is None:
                continue

            arr = np.frombuffer(blob, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is None:
                errors.append(f"{contact['name']} image {record['id']}: could not decode")
                continue

            try:
                embeddings = pipeline.generate_embeddings([img])
            except Exception as e:
                errors.append(f"{contact['name']} image {record['id']}: pipeline error — {e}")
                continue

            if embeddings:
                db.save_embedding(contact["id"], record["id"], embeddings[0])
                total += 1
            else:
                errors.append(f"{contact['name']} image {record['id']}: no face detected")

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
