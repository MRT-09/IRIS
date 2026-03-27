import queue

from flask import Blueprint, Response, jsonify, request, stream_with_context

notify_bp = Blueprint("notify", __name__)

_push_tokens = {}


@notify_bp.route("/events", methods=["GET"])
def events():
    client_queue = queue.Queue()

    def generate():
        try:
            while True:
                try:
                    data = client_queue.get(timeout=30)
                    yield f"data: {data}\n\n"
                except queue.Empty:
                    yield ": keepalive\n\n"
        except GeneratorExit:
            pass
        finally:
            pass

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@notify_bp.route("/register", methods=["POST"])
def register_token():
    data = request.get_json(force=True)
    token = data.get("token", "").strip()
    platform = data.get("platform", "").strip()

    if not token or platform not in ("fcm", "webpush"):
        return jsonify({"error": "token and platform (fcm|webpush) are required"}), 400

    _push_tokens[token] = {"token": token, "platform": platform}
    return jsonify({"status": "registered"}), 201
