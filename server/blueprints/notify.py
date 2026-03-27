import json
import queue
import threading

from flask import Blueprint, Response, stream_with_context

notify_bp = Blueprint("notify", __name__)

_client_queues: list = []
_queues_lock = threading.Lock()


def broadcast(event: dict):
    """Push a detection event to all connected SSE clients."""
    data = json.dumps(event)
    with _queues_lock:
        for q in list(_client_queues):
            try:
                q.put_nowait(data)
            except queue.Full:
                pass


@notify_bp.route("/events", methods=["GET"])
def events():
    client_queue = queue.Queue(maxsize=20)
    with _queues_lock:
        _client_queues.append(client_queue)

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
            with _queues_lock:
                if client_queue in _client_queues:
                    _client_queues.remove(client_queue)

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
