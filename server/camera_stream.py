#!/usr/bin/env python3
"""
IRIS Camera Streamer — runs on the Raspberry Pi alongside the Flask server.

Captures frames from the Pi camera and pushes them to the local Flask server
via a single long-lived chunked HTTP POST to /api/stream/push.

The server parses JPEG SOI/EOI byte markers from the raw stream, so we simply
concatenate raw JPEG bytes back-to-back with no additional framing.

Backend priority:
  1. rpicam-vid subprocess  — Pi Camera Module (CSI), no Python ABI issues
  2. picamera2              — Pi Camera Module via Python bindings
  3. OpenCV VideoCapture    — USB webcam fallback

Environment variables:
    IRIS_SERVER_URL    Flask server base URL  (default: http://localhost:8000)
    IRIS_TARGET_FPS    Capture rate in Hz     (default: 2.0)
    IRIS_JPEG_QUALITY  JPEG quality 1–100     (default: 80)  [rpicam/picamera2 only]
    IRIS_FRAME_WIDTH   Capture width  px      (default: 640)
    IRIS_FRAME_HEIGHT  Capture height px      (default: 480)
"""

import os
import sys
import shutil
import subprocess
import time
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [camera] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

SERVER_URL    = os.environ.get("IRIS_SERVER_URL",    "http://localhost:8000")
TARGET_FPS    = float(os.environ.get("IRIS_TARGET_FPS",    "1.0"))
JPEG_QUALITY  = int(os.environ.get("IRIS_JPEG_QUALITY",    "80"))
FRAME_WIDTH   = int(os.environ.get("IRIS_FRAME_WIDTH",     "640"))
FRAME_HEIGHT  = int(os.environ.get("IRIS_FRAME_HEIGHT",    "480"))
RECONNECT_DELAY = 5  # seconds between reconnect attempts

JPEG_SOI = b"\xff\xd8"
JPEG_EOI = b"\xff\xd9"


# ── Camera initialisation ────────────────────────────────────────────────────

def _try_rpicam_subprocess():
    """
    Launch rpicam-vid (or libcamera-vid) as a subprocess that writes MJPEG
    frames to stdout.  Works regardless of Python version — no ABI binding.
    Returns (subprocess.Popen, 'rpicam') or (None, None).
    """
    cmd = shutil.which("rpicam-vid") or shutil.which("libcamera-vid")
    if cmd is None:
        log.debug("rpicam-vid / libcamera-vid not found in PATH")
        return None, None
    try:
        proc = subprocess.Popen(
            [
                cmd,
                "--codec", "mjpeg",
                "--framerate", str(max(1, int(TARGET_FPS))),
                "--width",  str(FRAME_WIDTH),
                "--height", str(FRAME_HEIGHT),
                "--quality", str(JPEG_QUALITY),
                "--nopreview",
                "-t", "0",      # run indefinitely
                "-o", "-",      # write to stdout
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        # Confirm it started by reading a small chunk within 3 s
        proc.stdout.read(2)
        log.info(
            "Camera: rpicam-vid subprocess (%dx%d @ %.1f fps)",
            FRAME_WIDTH, FRAME_HEIGHT, TARGET_FPS,
        )
        return proc, "rpicam"
    except Exception as exc:
        log.debug("rpicam subprocess failed: %s", exc)
        return None, None


def _try_picamera2():
    """Return (Picamera2 instance, 'picamera2') or (None, None)."""
    try:
        from picamera2 import Picamera2  # type: ignore
        cam = Picamera2()
        cfg = cam.create_video_configuration(
            main={"size": (FRAME_WIDTH, FRAME_HEIGHT), "format": "RGB888"},
            controls={"FrameRate": TARGET_FPS},
        )
        cam.configure(cfg)
        cam.start()
        time.sleep(1)  # allow sensor to warm up
        log.info("Camera: picamera2 (%dx%d @ %.1f fps)", FRAME_WIDTH, FRAME_HEIGHT, TARGET_FPS)
        return cam, "picamera2"
    except Exception as exc:
        log.debug("picamera2 unavailable: %s", exc)
        return None, None


def _try_opencv():
    """Return (cv2.VideoCapture instance, 'opencv') or (None, None)."""
    try:
        import cv2  # type: ignore
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            log.debug("OpenCV: /dev/video0 not found or busy")
            return None, None
        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  FRAME_WIDTH)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
        cap.set(cv2.CAP_PROP_FPS, TARGET_FPS)
        log.info(
            "Camera: OpenCV VideoCapture (%dx%d @ %.1f fps)",
            FRAME_WIDTH, FRAME_HEIGHT, TARGET_FPS,
        )
        return cap, "opencv"
    except Exception as exc:
        log.debug("OpenCV unavailable: %s", exc)
        return None, None


def open_camera():
    for fn in (_try_rpicam_subprocess, _try_picamera2, _try_opencv):
        cam, backend = fn()
        if cam is not None:
            return cam, backend
    log.error("No camera found (tried rpicam-vid, picamera2, OpenCV). Exiting.")
    sys.exit(1)


# ── Frame generators ──────────────────────────────────────────────────────────

def _rpicam_frames(proc):
    """
    Parse the MJPEG byte stream from rpicam-vid stdout into individual JPEGs.
    rpicam-vid outputs back-to-back JPEG frames with no extra framing — we
    locate SOI/EOI markers exactly like the Flask server does on the other end.
    """
    buf = b""
    interval = 1.0 / TARGET_FPS

    while True:
        t0 = time.monotonic()

        try:
            chunk = proc.stdout.read(65536)
            if not chunk:
                log.warning("rpicam-vid stdout closed")
                return
            buf += chunk
        except Exception as exc:
            log.error("rpicam read error: %s", exc)
            return

        # Extract all complete JPEGs from the buffer
        while True:
            start = buf.find(JPEG_SOI)
            if start == -1:
                buf = b""
                break
            end = buf.find(JPEG_EOI, start + 2)
            if end == -1:
                buf = buf[start:]
                break
            yield buf[start:end + 2]
            buf = buf[end + 2:]

        elapsed = time.monotonic() - t0
        wait = interval - elapsed
        if wait > 0:
            time.sleep(wait)


def _cv_frames(cam, backend):
    """Yield JPEG bytes from picamera2 or OpenCV at TARGET_FPS."""
    import cv2
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
    interval = 1.0 / TARGET_FPS

    while True:
        t0 = time.monotonic()
        try:
            if backend == "picamera2":
                rgb = cam.capture_array()
                bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            else:
                ret, bgr = cam.read()
                if not ret:
                    log.warning("Frame read failed; skipping")
                    time.sleep(0.1)
                    continue

            ok, buf = cv2.imencode(".jpg", bgr, encode_params)
            if ok:
                yield buf.tobytes()
            else:
                log.warning("JPEG encode failed; skipping frame")

        except Exception as exc:
            log.error("Frame capture error: %s", exc)
            return

        elapsed = time.monotonic() - t0
        wait = interval - elapsed
        if wait > 0:
            time.sleep(wait)


def frame_generator(cam, backend):
    if backend == "rpicam":
        return _rpicam_frames(cam)
    return _cv_frames(cam, backend)


# ── HTTP streaming ────────────────────────────────────────────────────────────

def stream_once(cam, backend):
    """
    Open one long-lived chunked POST to /api/stream/push.
    requests uses Transfer-Encoding: chunked automatically for generator data.
    """
    import requests  # type: ignore

    url = SERVER_URL.rstrip("/") + "/api/stream/push"
    log.info("Connecting → %s", url)

    try:
        with requests.post(
            url,
            data=frame_generator(cam, backend),
            headers={"Content-Type": "application/octet-stream"},
            stream=True,
            timeout=None,
        ) as resp:
            log.info("Stream ended (HTTP %d)", resp.status_code)
    except requests.exceptions.ConnectionError:
        log.warning("Server unreachable — is the Flask server running?")
    except Exception as exc:
        log.error("Streaming error: %s", exc)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    cam, backend = open_camera()
    try:
        while True:
            stream_once(cam, backend)
            log.info("Reconnecting in %ds …", RECONNECT_DELAY)
            time.sleep(RECONNECT_DELAY)
    except KeyboardInterrupt:
        log.info("Stopped.")
    finally:
        if backend == "rpicam":
            cam.terminate()
        elif backend == "picamera2":
            cam.stop()
        else:
            cam.release()
        log.info("Camera released.")


if __name__ == "__main__":
    main()
