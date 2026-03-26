from datetime import datetime
from .db import db


class Contact(db.Model):
    __tablename__ = "contacts"

    id = db.Column(db.Text, primary_key=True)
    name = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    images = db.relationship("ContactImage", backref="contact", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ContactImage(db.Model):
    __tablename__ = "contact_images"

    id = db.Column(db.Text, primary_key=True)
    contact_id = db.Column(db.Text, db.ForeignKey("contacts.id"), nullable=False)
    filepath = db.Column(db.Text)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "contact_id": self.contact_id,
            "filepath": self.filepath,
            "uploaded_at": self.uploaded_at.isoformat() if self.uploaded_at else None,
        }


class ModelVersion(db.Model):
    __tablename__ = "model_versions"

    id = db.Column(db.Text, primary_key=True)
    trained_at = db.Column(db.DateTime, default=datetime.utcnow)
    embedding_path = db.Column(db.Text)
    contacts_hash = db.Column(db.Text)

    def to_dict(self):
        return {
            "id": self.id,
            "trained_at": self.trained_at.isoformat() if self.trained_at else None,
            "embedding_path": self.embedding_path,
            "contacts_hash": self.contacts_hash,
        }
