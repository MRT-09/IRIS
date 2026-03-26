import os

from flask import Blueprint, Response, current_app, request, stream_with_context

from config import INFERENCE_INTERVAL_FRAMES

stream_bp = Blueprint("stream", __name__)

MULTIPART_BOUNDARY = b"--frame"
JPEG_SOI = b"\xff\xd8"
JPEG_EOI = b"\xff\xd9"


@stream_bp.route("/push", methods=["POST"])
def push_stream():
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

            frame_bytes = buf[start : end + 2]
            buf = buf[end + 2 :]

            frame_counter += 1
            if frame_counter % INFERENCE_INTERVAL_FRAMES == 0:
                try:
                    pass
                except Exception:
                    pass

    return "", 200


@stream_bp.route("/preview", methods=["GET"])
def preview_stream():
    if not current_app.debug:
        return "", 404

    def generate():
        while True:
            try:
                frame_bytes = b""  
            except Exception:
                continue
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + frame_bytes
                + b"\r\n"
            )

    return Response(
        stream_with_context(generate()),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )
