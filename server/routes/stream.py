import threading
import time
from datetime import datetime, timezone

import cv2
import numpy as np
from flask import Blueprint, Response, current_app, request, stream_with_context

import db
import pipeline
from config import INFERENCE_INTERVAL_FRAMES

stream_bp = Blueprint("stream", __name__)

JPEG_SOI = b"\xff\xd8"
JPEG_EOI = b"\xff\xd9"

_latest_frame: bytes | None = None
_latest_inference_frame: bytes | None = None
_frame_lock = threading.Lock()


def get_latest_frame() -> bytes | None:
    with _frame_lock:
        return _latest_frame


def _set_latest_frame(frame_bytes: bytes):
    global _latest_frame
    with _frame_lock:
        _latest_frame = frame_bytes


def _set_latest_inference_frame(frame_bytes: bytes):
    global _latest_inference_frame
    with _frame_lock:
        _latest_inference_frame = frame_bytes


def get_latest_inference_frame() -> bytes | None:
    with _frame_lock:
        return _latest_inference_frame


@stream_bp.route("/push", methods=["POST"])
def push_stream():
    from routes.notify import broadcast

    cooldown = current_app.extensions.get("iris_cooldown")
    frame_counter = 0
    buf = b""

    for chunk in request.stream:
        buf += chunk

        while True:
            start = buf.find(JPEG_SOI)
            if start == -1:
                buf = b""
                break

            end = buf.find(JPEG_EOI, start + 2)
            if end == -1:
                buf = buf[start:]
                break

            frame_bytes = buf[start:end + 2]
            buf = buf[end + 2:]

            _set_latest_frame(frame_bytes)

            frame_counter += 1
            if frame_counter % INFERENCE_INTERVAL_FRAMES == 0 and cooldown:
                try:
                    arr = np.frombuffer(frame_bytes, dtype=np.uint8)
                    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                    _set_latest_inference_frame(frame_bytes)
                    if frame is not None:
                        all_embeddings = db.get_all_embeddings()
                        detections = pipeline.process_frame(frame, all_embeddings)
                        detections = cooldown.filter_detections(detections)
                        if detections:
                            broadcast({
                                "type": "contact_detected",
                                "contacts": [
                                    {
                                        "contact_id": d["contact_id"],
                                        "name": d["name"],
                                        "confidence": d["confidence"],
                                    }
                                    for d in detections
                                ],
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            })
                except Exception:
                    pass

    return "", 200


@stream_bp.route("/inference_frame", methods=["GET"])
def inference_frame():
    frame = get_latest_inference_frame()
    if frame is None:
        return "", 204
    return Response(
        frame,
        mimetype="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@stream_bp.route("/preview", methods=["GET"])
def preview_stream():
    if not current_app.debug:
        return "", 404

    def generate():
        while True:
            frame = get_latest_frame()
            if frame:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + frame
                    + b"\r\n"
                )
            else:
                time.sleep(0.05)

    return Response(
        stream_with_context(generate()),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )
