import os
import sqlite3
import uuid
from datetime import datetime

import numpy as np
from flask import g, current_app


def get_db():
    if "db" not in g:
        db_path = current_app.config["DATABASE"]
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        g.db = sqlite3.connect(
            db_path,
            detect_types=sqlite3.PARSE_DECLTYPES,
        )
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
        g.db.execute("PRAGMA journal_mode = WAL")
    return g.db


def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db(app):
    app.config.setdefault("DATABASE", os.path.join(app.instance_path, "iris.db"))
    os.makedirs(app.instance_path, exist_ok=True)
    app.teardown_appcontext(close_db)

    conn = sqlite3.connect(app.config["DATABASE"])
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS contacts (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS contact_images (
                id          TEXT PRIMARY KEY,
                contact_id  TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
                image_data  BLOB NOT NULL,
                uploaded_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS contact_embeddings (
                id         TEXT PRIMARY KEY,
                contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
                embedding  BLOB NOT NULL
            )
        """)
        conn.commit()

        # Migration: add image_id column if it does not exist yet
        existing_cols = {
            row[1]
            for row in conn.execute("PRAGMA table_info(contact_embeddings)").fetchall()
        }
        if "image_id" not in existing_cols:
            conn.execute(
                "ALTER TABLE contact_embeddings ADD COLUMN image_id TEXT REFERENCES contact_images(id)"
            )
            conn.commit()

        # Remove any embeddings that predate the migration (no image_id)
        conn.execute("DELETE FROM contact_embeddings WHERE image_id IS NULL")
        conn.commit()
    finally:
        conn.close()


def create_contact(id, name):
    now = datetime.utcnow().isoformat()
    db = get_db()
    existing = db.execute("SELECT id FROM contacts WHERE id = ?", (id,)).fetchone()
    if existing:
        db.execute(
            "UPDATE contacts SET name = ?, updated_at = ? WHERE id = ?",
            (name, now, id),
        )
    else:
        db.execute(
            "INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (id, name, now, now),
        )
    db.commit()
    return get_contact(id)


def get_contact(id):
    row = get_db().execute("SELECT * FROM contacts WHERE id = ?", (id,)).fetchone()
    return dict(row) if row else None


def update_contact(id, name):
    now = datetime.utcnow().isoformat()
    db = get_db()
    db.execute("UPDATE contacts SET name = ?, updated_at = ? WHERE id = ?", (name, now, id))
    db.commit()
    return get_contact(id)


def delete_contact(id):
    db = get_db()
    db.execute("DELETE FROM contacts WHERE id = ?", (id,))
    db.commit()


def list_contacts():
    rows = get_db().execute("SELECT * FROM contacts ORDER BY created_at").fetchall()
    return [dict(r) for r in rows]


def save_image(contact_id, image_bytes):
    image_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    db = get_db()
    db.execute(
        "INSERT INTO contact_images (id, contact_id, image_data, uploaded_at) VALUES (?, ?, ?, ?)",
        (image_id, contact_id, image_bytes, now),
    )
    db.commit()
    return image_id


def get_images(contact_id):
    rows = get_db().execute(
        "SELECT image_data FROM contact_images WHERE contact_id = ?", (contact_id,)
    ).fetchall()
    return [row[0] for row in rows]


def delete_images(contact_id):
    db = get_db()
    db.execute("DELETE FROM contact_images WHERE contact_id = ?", (contact_id,))
    db.commit()


def list_image_records(contact_id):
    rows = get_db().execute(
        "SELECT id, contact_id, uploaded_at FROM contact_images WHERE contact_id = ?",
        (contact_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def save_embedding(contact_id: str, image_id: str, embedding: np.ndarray):
    """Store a single embedding linked to a specific source image."""
    conn = get_db()
    conn.execute(
        "INSERT INTO contact_embeddings (id, contact_id, image_id, embedding) VALUES (?, ?, ?, ?)",
        (str(uuid.uuid4()), contact_id, image_id, embedding.astype(np.float32).tobytes()),
    )
    conn.commit()


def get_processed_image_ids(contact_id: str) -> set:
    """Return the set of image IDs that already have a stored embedding."""
    rows = get_db().execute(
        "SELECT image_id FROM contact_embeddings WHERE contact_id = ? AND image_id IS NOT NULL",
        (contact_id,),
    ).fetchall()
    return {row[0] for row in rows}


def get_image(image_id: str):
    """Fetch the raw image blob for a single image record."""
    row = get_db().execute(
        "SELECT image_data FROM contact_images WHERE id = ?", (image_id,)
    ).fetchone()
    return row[0] if row else None




def delete_embeddings(contact_id):
    db = get_db()
    db.execute("DELETE FROM contact_embeddings WHERE contact_id = ?", (contact_id,))
    db.commit()


def get_all_embeddings():
    rows = get_db().execute("""
        SELECT ce.contact_id, c.name, ce.embedding
        FROM contact_embeddings ce
        JOIN contacts c ON c.id = ce.contact_id
    """).fetchall()
    result = []
    for row in rows:
        emb = np.frombuffer(row[2], dtype=np.float32).copy()
        result.append((row[0], row[1], emb))
    return result
