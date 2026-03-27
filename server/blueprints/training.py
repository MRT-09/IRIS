from flask import Blueprint, jsonify, current_app

training_bp = Blueprint("training", __name__)


@training_bp.route("/submit", methods=["POST"])
def submit_training():
    return jsonify({"status": "accepted"}), 202


@training_bp.route("/status", methods=["GET"])
def get_status():
    return jsonify({})
