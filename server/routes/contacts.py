import base64
import os
import uuid

from flask import Blueprint, current_app, jsonify, request

import db

contacts_bp = Blueprint("contacts", __name__)
ALLOWED = {".jpg", ".jpeg", ".png"}


@contacts_bp.route("/", methods=["GET"])
def list_contacts():
    return jsonify(db.list_contacts())


@contacts_bp.route("/", methods=["POST"])
def create_contact():
    data = request.get_json(force=True)
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    contact_id = data.get("contact_id") or str(uuid.uuid4())
    images_b64 = data.get("images", [])

    contact = db.create_contact(contact_id, name)

    images_saved = 0
    if images_b64:
        db.delete_embeddings(contact_id)
        db.delete_images(contact_id)
        for b64_str in images_b64:
            try:
                db.save_image(contact_id, base64.b64decode(b64_str))
                images_saved += 1
            except Exception:
                continue

    cooldown = current_app.extensions.get("iris_cooldown")
    if cooldown:
        cooldown.reset(contact_id)

    result = dict(contact)
    result["images_saved"] = images_saved
    return jsonify(result), 201


@contacts_bp.route("/<contact_id>", methods=["PUT"])
def update_contact(contact_id):
    if not db.get_contact(contact_id):
        return jsonify({"error": "not found"}), 404
    data = request.get_json(force=True)
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    return jsonify(db.update_contact(contact_id, name))


@contacts_bp.route("/<contact_id>", methods=["DELETE"])
def delete_contact(contact_id):
    if not db.get_contact(contact_id):
        return jsonify({"error": "not found"}), 404
    db.delete_contact(contact_id)
    cooldown = current_app.extensions.get("iris_cooldown")
    if cooldown:
        cooldown.reset(contact_id)
    return "", 204


@contacts_bp.route("/<contact_id>/images", methods=["POST"])
def upload_images(contact_id):
    if not db.get_contact(contact_id):
        return jsonify({"error": "not found"}), 404
    files = request.files.getlist("images")
    if not files:
        return jsonify({"error": "no images provided"}), 400
    saved = []
    for f in files:
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in ALLOWED:
            return jsonify({"error": f"unsupported file type: {ext}"}), 400
        image_id = db.save_image(contact_id, f.read())
        saved.append({"id": image_id, "contact_id": contact_id})
    return jsonify(saved), 201


@contacts_bp.route("/<contact_id>/images", methods=["GET"])
def list_images(contact_id):
    if not db.get_contact(contact_id):
        return jsonify({"error": "not found"}), 404
    return jsonify(db.list_image_records(contact_id))
