from sqlalchemy import text
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def init_db(app):
    app.config.setdefault(
        "SQLALCHEMY_DATABASE_URI", "sqlite:///iris.db"
    )
    app.config.setdefault("SQLALCHEMY_TRACK_MODIFICATIONS", False)
    app.config.setdefault("SQLALCHEMY_ENGINE_OPTIONS", {
        "connect_args": {"timeout": 20, "check_same_thread": False},
    })
    db.init_app(app)
    with app.app_context():
        db.create_all()
        with db.engine.connect() as conn:
            conn.execute(text("PRAGMA journal_mode=WAL"))
            conn.commit()
