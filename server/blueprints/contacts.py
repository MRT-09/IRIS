import os
import shutil
import uuid
from datetime import datetime

from flask import Blueprint, jsonify, request

from models.contact import Contact, ContactImage
from models.db import db

contacts_bp = Blueprint("contacts", __name__)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def _contact_images_dir(contact_id):
    from config import CONTACTS_DIR
    return os.path.join(CONTACTS_DIR, contact_id, "images")


@contacts_bp.route("/", methods=["GET"])
def list_contacts():
    contacts = Contact.query.all()
    return jsonify([c.to_dict() for c in contacts])


@contacts_bp.route("/", methods=["POST"])
def create_contact():
    data = request.get_json(force=True)
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    contact_id = str(uuid.uuid4())
    now = datetime.utcnow()
    contact = Contact(id=contact_id, name=name, created_at=now, updated_at=now)
    db.session.add(contact)
    db.session.commit()

    os.makedirs(_contact_images_dir(contact_id), exist_ok=True)
    return jsonify(contact.to_dict()), 201


@contacts_bp.route("/<contact_id>", methods=["PUT"])
def update_contact(contact_id):
    contact = Contact.query.get_or_404(contact_id)
    data = request.get_json(force=True)
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    contact.name = name
    contact.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(contact.to_dict())


@contacts_bp.route("/<contact_id>", methods=["DELETE"])
def delete_contact(contact_id):
    contact = Contact.query.get_or_404(contact_id)
    db.session.delete(contact)
    db.session.commit()

    from config import CONTACTS_DIR
    contact_dir = os.path.join(CONTACTS_DIR, contact_id)
    if os.path.exists(contact_dir):
        shutil.rmtree(contact_dir)

    return "", 204

@contacts_bp.route("/<contact_id>/images", methods=["POST"])
def upload_images(contact_id):
    Contact.query.get_or_404(contact_id)

    files = request.files.getlist("images")
    if not files:
        return jsonify({"error": "no images provided"}), 400

    saved = []
    images_dir = _contact_images_dir(contact_id)
    os.makedirs(images_dir, exist_ok=True)

    # Prepare records but don't commit yet
    for f in files:
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return jsonify({"error": f"unsupported file type: {ext}"}), 400

        image_id = str(uuid.uuid4())
        filename = f"{image_id}.jpg"
        filepath = os.path.join(images_dir, filename)

        record = ContactImage(
            id=image_id,
            contact_id=contact_id,
            filepath=filepath,
            uploaded_at=datetime.utcnow(),
        )
        db.session.add(record)
        saved.append((record, f))
        
    try:
        db.session.commit()
        for record, f in saved:
            f.save(record.filepath)
        return jsonify([r.to_dict() for r, _ in saved]), 201
    except Exception as e:
        db.session.rollback()
        for record, _ in saved:
            if os.path.exists(record.filepath):
                os.remove(record.filepath)
        return jsonify({"error": "upload failed"}), 500

@contacts_bp.route("/<contact_id>/images", methods=["GET"])
def list_images(contact_id):
    Contact.query.get_or_404(contact_id)
    images = ContactImage.query.filter_by(contact_id=contact_id).all()
    return jsonify([img.to_dict() for img in images])
