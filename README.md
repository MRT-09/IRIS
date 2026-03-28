# IRIS - Intelligent Recognition & Identification System

## Project Overview

IRIS is an assistive wearable face-recognition system. A camera streamer running on a Raspberry Pi pushes a continuous video stream to a Flask backend, which runs face recognition. When a known contact is detected, the mobile app is notified and announces the person's name — via Text-to-Speech if earbuds are connected, or via push notification otherwise.

The system uses a frozen face embedding model, meaning contact registration only requires computing and storing embeddings. No neural network retraining is ever needed.

---

## Architecture

1. **Camera Streamer (`server/camera_stream.py`):**
   - Runs on the Raspberry Pi alongside the Flask server.
   - Captures frames and pushes them as a continuous chunked JPEG stream to the backend via `POST /api/stream/push`.
   - Supports three camera backends in priority order: `rpicam-vid` subprocess (CSI camera), `picamera2`, and OpenCV (USB webcam fallback).

2. **Server (Flask / Python):**
   - Receives the JPEG stream, parses individual frames, and runs face recognition every N frames (configurable).
   - Maintains an SQLite database storing contacts, their face images, and per-image face embeddings.
   - When a known face is detected, broadcasts a Server-Sent Event to all connected mobile clients.
   - Offers REST APIs for contact management, incremental training, and live notifications.

3. **Mobile App (React Native / Expo):**
   - A cross-platform mobile client for managing recognized contacts.
   - Syncs contact photos with the backend via REST API and triggers incremental training.
   - Detects connected Bluetooth audio devices to selectively announce faces via Text-to-Speech or push notifications.
   - Stores raw contact images in local SQLite on the device for privacy.

---

## Features

- **No Model Retraining:** Uses the frozen `buffalo_sc` model (InsightFace). Contact registration is simply running photos through the model and saving the resulting embeddings.
- **Incremental Training:** Only unprocessed images are embedded on each training run. Adding one new photo processes exactly that photo — nothing else is recomputed.
- **Privacy-First Storage:** Raw face images are stored in the mobile app's local SQLite database and only sent to the backend during sync.
- **Smart Audio Routing:** If Bluetooth earbuds are connected, detected contact names are spoken aloud via TTS. Otherwise, a silent push notification is sent.
- **Alert Cooldowns:** Each recognized contact enters a cooldown period after detection (default: 1 hour, configurable) to prevent repeated announcements.
- **Real-Time Notifications:** The mobile app connects to a persistent SSE stream (`/api/notify/events`) and receives detection events instantly without polling.
- **Camera Backend Fallback:** Automatically tries `rpicam-vid`, then `picamera2`, then OpenCV — works on Pi Camera Modules and USB webcams.

---

## How to Run

### 1. Start the Server (Backend)

1. Navigate to the project root and install the required packages (a virtual environment is recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
2. Start the Flask backend:
   ```bash
   python server/app.py
   ```
   The server runs on `0.0.0.0:8000` by default.

3. In a separate terminal, start the camera streamer:
   ```bash
   python server/camera_stream.py
   ```

### 2. Start the Mobile App (Frontend)

1. Navigate to the `client/` directory and install dependencies:
   ```bash
   cd client
   npm install
   ```
2. Start the Expo development server:
   ```bash
   npx expo start
   ```
3. Download the **Expo Go** app on your iOS or Android device and scan the QR code shown in the terminal.

---

## API Summary

**Contacts**
- `GET /api/contacts/` — List all contacts.
- `POST /api/contacts/` — Create a contact (optionally with base64-encoded images).
- `PUT /api/contacts/<id>` — Update a contact's name.
- `DELETE /api/contacts/<id>` — Delete a contact and all their images and embeddings.
- `POST /api/contacts/<id>/images` — Upload face images for a contact.
- `GET /api/contacts/<id>/images` — List image records for a contact.

**Training**
- `POST /api/training/submit` — Run incremental training (only processes images without an existing embedding).
- `GET /api/training/status` — Returns training state (`ready` or `untrained`) and embedding count.

**Stream**
- `POST /api/stream/push` — Accepts a continuous chunked JPEG stream from the camera streamer.
- `GET /api/stream/inference_frame` — Returns the most recent frame that was run through inference.

**Notifications**
- `GET /api/notify/events` — SSE stream. Pushes `contact_detected` events to connected clients in real time.

---

## Configuration

All settings are controlled via environment variables:

| Variable | Default | Description |
|---|---|---|
| `IRIS_EMBEDDING_MODEL` | `insightface` | Face recognition backend (`insightface` or `face_recognition`) |
| `IRIS_INFERENCE_INTERVAL_FRAMES` | `1` | Run inference every N frames |
| `IRIS_DETECTION_COOLDOWN_SECONDS` | `3600` | Cooldown between repeated announcements per contact |
| `IRIS_RECOGNITION_THRESHOLD` | `0.5` | Cosine distance threshold for a positive match |
| `IRIS_DETECTION_CONFIDENCE` | `0.5` | Minimum face detection confidence score |
| `IRIS_SERVER_URL` | `http://localhost:8000` | Server URL used by the camera streamer |
| `IRIS_TARGET_FPS` | `1.0` | Camera capture rate |

---

## Technology Stack

- **Backend:** Python, Flask, OpenCV, InsightFace, SQLite
- **Frontend:** React Native, Expo (Router, Audio, Notifications, Speech)
- **Database:** SQLite (server-side for embeddings, device-side for images)
