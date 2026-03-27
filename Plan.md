# IRIS - Intelligent Recognition & Identification System

## Project Overview

IRIS is an assistive wearable face-recognition system. A wearable device (Pi Zero + camera) streams video to a Flask backend, which runs face recognition. When a known contact is detected, the mobile app is notified and announces the person's name.

---

## Architecture

### Components

1. **Wearable Device** — Raspberry Pi Zero W with camera module. Continuously streams video frames to the Flask server over WiFi.
2. **Flask Server** — Receives video stream, runs face detection + recognition using a frozen embedding model (FaceNet/ArcFace). Stores face embeddings per contact. Sends detection events to the mobile app.
3. **Mobile App (JavaScript)** — User-facing interface for managing contacts and receiving detection alerts. Uses a local SQLite database for contact images. Communicates with the Flask server via REST API.

### Data Flow

```
Pi Zero (camera) --[video frames]--> Flask Server --[detection event]--> Mobile App
Mobile App --[contact images]--> Flask Server --[generates embeddings]--> Embedding Store
```

---

## Core Design Decisions

- **No model retraining.** Use a frozen face embedding model (FaceNet or ArcFace). Contact registration = computing and storing embeddings. Recognition = nearest-neighbor lookup against stored embeddings.
- **Images stay on the phone.** The local SQLite DB on the mobile app is the source of truth for raw face images. Images are sent to the server only for embedding generation, not stored long-term on the server.
- **Earbud detection determines output mode.** The mobile app checks Bluetooth audio connection status. If earbuds are connected → TTS (text-to-speech) speaks the contact name. If no earbuds → push notification only.
- **1-hour cooldown per contact.** After a contact is announced, the same contact is not announced again for 60 minutes.
- **Multiple simultaneous detections** are announced left to right based on their position in the frame.

---

## User Experience

### Phase 1: Initialization (Contact Management)

1. User opens the mobile app.
2. User creates a new contact by providing a name and uploading several face images.
3. Contacts can be created/edited at any time.
4. User submits new/updated contacts. The app sends the images to the server.
5. The server generates face embeddings for each image and stores them associated with the contact ID.
6. Contact is now ready for recognition.

### Phase 2: Inference (Live Recognition)

1. User activates the wearable device.
2. Pi Zero streams video frames to the Flask server.
3. Server runs face detection on each frame.
4. Detected faces are cropped, embedded, and compared against stored contact embeddings (nearest-neighbor).
5. If a match is found and the contact is not in cooldown:
   - Server sends a detection event to the mobile app (contact name + position in frame).
   - If multiple contacts detected in the same frame, they are ordered left-to-right by face position.
6. Mobile app receives the event:
   - Checks Bluetooth audio status.
   - If earbuds connected → runs TTS to speak the contact name(s).
   - If no earbuds → sends a local push notification with the contact name(s).

---

## Tech Stack

| Component     | Technology                                                     |
| ------------- | -------------------------------------------------------------- |
| Wearable      | Raspberry Pi Zero W, Pi Camera, Python (picamera2 or similar)  |
| Server        | Python, Flask, face_recognition / InsightFace (ArcFace), NumPy |
| Mobile App    | JavaScript (React Native or similar), SQLite (local DB)        |
| Communication | REST API (JSON), WebSocket for real-time detection events      |
| TTS           | Web Speech API or platform-native TTS                          |

---

## API Endpoints

### Contact Management

#### `POST /contacts`

Create or update a contact. Receives contact name + face images. Server generates and stores embeddings.

**Request:**

```json
{
  "contact_id": "string (UUID)",
  "name": "string",
  "images": ["base64-encoded image strings"]
}
```

**Response:**

```json
{
  "status": "success",
  "contact_id": "string",
  "embeddings_count": 5
}
```

#### `DELETE /contacts/<contact_id>`

Remove a contact and its embeddings.

#### `GET /contacts`

List all registered contacts (id + name, no images).

### Video Stream

#### `POST /stream/frame`

Receive a single video frame from the Pi Zero for processing.

**Request:** JPEG image as binary payload or base64.

**Response:**

```json
{
  "detections": [
    {
      "contact_id": "string",
      "name": "string",
      "confidence": 0.92,
      "x_position": 150
    }
  ]
}
```

### Detection Events (WebSocket)

#### `ws /events`

Real-time channel to push detection events to the mobile app.

**Event payload:**

```json
{
  "type": "contact_detected",
  "contacts": [
    {
      "contact_id": "string",
      "name": "string",
      "confidence": 0.92
    }
  ],
  "timestamp": "ISO 8601"
}
```

---

## Server Implementation Details

### Face Recognition Pipeline

1. Receive frame (JPEG).
2. Detect faces using dlib/MTCNN/RetinaFace.
3. For each detected face:
   a. Crop and align the face.
   b. Generate 128D or 512D embedding using frozen model.
   c. Compare against all stored embeddings using cosine similarity or Euclidean distance.
   d. If distance < threshold → match found.
4. Sort matched contacts by their x-coordinate (left to right).
5. Filter out contacts currently in cooldown (1 hour since last announcement).
6. Emit detection event via WebSocket.

### Embedding Storage

- Store embeddings in-memory (dict) for fast lookup, backed by a persistent file (pickle/JSON) or lightweight DB (SQLite on server side).
- Structure: `{ contact_id: { name: str, embeddings: [list of numpy arrays] } }`
- For matching, compare against all embeddings per contact. A contact matches if ANY of its embeddings is within threshold.

### Cooldown Tracking

- Server maintains a dict: `{ contact_id: last_announced_timestamp }`
- Before emitting a detection event, check if `now - last_announced > 3600 seconds`.
- Reset the timer on each new announcement.

---

## Mobile App Implementation Details

### Local SQLite Schema

```sql
CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    synced INTEGER DEFAULT 0
);

CREATE TABLE contact_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id TEXT NOT NULL,
    image_blob BLOB NOT NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);
```

### Earbud Detection Logic

```
On detection event received:
  1. Check Bluetooth audio device connection status.
  2. If audio device connected:
       → Use TTS to speak: "[Contact Name] detected"
       → If multiple contacts: speak left-to-right, e.g. "John, then Sarah"
  3. If no audio device:
       → Fire local push notification: "Detected: John, Sarah"
```

### App Screens

1. **Home / Live Status** — Shows whether the wearable is streaming. Displays last detection events.
2. **Contacts List** — View all contacts. Tap to edit or delete.
3. **Add/Edit Contact** — Name field + image capture/upload (multiple images). Submit button syncs to server.
4. **Settings** — Server URL configuration, cooldown duration (default 1hr), confidence threshold.

---

## Pi Zero Streaming Implementation

- Capture frames using `picamera2` or `opencv`.
- Compress each frame as JPEG (quality ~70 for bandwidth).
- POST each frame to the server's `/stream/frame` endpoint.
- Target frame rate: 2-5 FPS (face recognition doesn't need 30fps).
- Consider sending only frames where motion is detected to save bandwidth.

---

## Project Structure

```
iris/
├── server/
│   ├── app.py                  # Flask app entry point
│   ├── config.py               # Configuration (thresholds, cooldown, etc.)
│   ├── routes/
│   │   ├── contacts.py         # Contact CRUD endpoints
│   │   └── stream.py           # Frame receiving + processing
│   ├── services/
│   │   ├── face_recognition.py # Embedding generation + matching
│   │   ├── cooldown.py         # Cooldown tracker
│   │   └── event_emitter.py    # WebSocket event broadcasting
│   ├── models/
│   │   └── embedding_store.py  # Embedding persistence
│   └── requirements.txt
├── mobile/
│   ├── src/
│   │   ├── screens/            # App screens
│   │   ├── components/         # Reusable UI components
│   │   ├── services/
│   │   │   ├── api.js          # Server communication
│   │   │   ├── database.js     # SQLite operations
│   │   │   ├── bluetooth.js    # Earbud detection
│   │   │   └── tts.js          # Text-to-speech
│   │   └── utils/
│   └── package.json
├── device/
│   ├── stream.py               # Pi Zero camera streaming script
│   └── config.py               # Device configuration (server URL, FPS, etc.)
└── claude.md
```

---

## Build Order

1. **Server: Core face recognition pipeline** — Embedding model loading, face detection, embedding generation, nearest-neighbor matching.
2. **Server: Contact management API** — CRUD endpoints for contacts + embedding storage.
3. **Server: Frame receiving endpoint** — Accept frames, run pipeline, return detections.
4. **Server: WebSocket event system** — Real-time detection event broadcasting.
5. **Server: Cooldown logic** — Track and enforce per-contact cooldown.
6. **Mobile: Local database + contact management UI** — SQLite schema, add/edit/delete contacts, image capture.
7. **Mobile: Server sync** — Upload contact images, receive detection events via WebSocket.
8. **Mobile: Notification + TTS system** — Earbud detection, TTS for audio, push notifications for no-audio.
9. **Device: Pi Zero streaming script** — Camera capture + frame upload loop.
10. **Integration testing** — End-to-end: device streams → server detects → app announces.

---

## Key Constraints

- The face embedding model is FROZEN. Never retrain it. Recognition is purely embedding comparison.
- Raw face images never persist on the server. Process → embed → discard.
- All cooldown and detection ordering logic lives on the server. The app is a thin client for display/audio.
- Target latency from frame capture to app notification: under 2 seconds.
