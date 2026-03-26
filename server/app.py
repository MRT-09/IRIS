import os
import sys
import threading

sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask

from config import CONTACTS_DIR, DATA_DIR
from models.db import init_db
from blueprints.contacts import contacts_bp
from blueprints.training import training_bp
from blueprints.stream import stream_bp
from blueprints.notify import notify_bp


def create_app():
    app = Flask(__name__)

    init_db(app)

    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(CONTACTS_DIR, exist_ok=True)

    with app.app_context():
        pass

    app.register_blueprint(contacts_bp, url_prefix="/api/contacts")
    app.register_blueprint(training_bp, url_prefix="/api/training")
    app.register_blueprint(stream_bp, url_prefix="/api/stream")
    app.register_blueprint(notify_bp, url_prefix="/api/notify")

    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=8000)
