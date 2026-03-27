# IRIS - Intelligent Recognition & Identification System

## Project Overview

IRIS is an assistive wearable face-recognition system. A wearable device streams video to a Flask backend, which runs face recognition. When a known contact is detected, the mobile app is notified and announces the person's name depending on whether earbuds are connected (Text-to-Speech) or not (Push Notifications).

The system uses a fast and efficient frozen face embedding model, allowing instant recognition by storing reference embeddings of known contacts without ever needing to retrain a neural network.

---

## Architecture

1. **Server (Flask / Python):** 
   - Receives incoming images and operates the deep learning Face Recognition Pipeline (using `insightface`).
   - Maintains an SQLite database and memory-loaded embedding store for ultra-fast face matching.
   - Offers REST APIs for contact management, detection streaming, and notifications.

2. **Mobile App (React Native / Expo):** 
   - A cross-platform mobile client for managing your recognized contacts.
   - Syncs faces with the backend via REST API.
   - Detects connected Bluetooth audio devices to selectively announce faces using local Text-to-Speech or Push Notifications.
   - Uses local SQLite to persist contact imagery exclusively on the user's device for privacy.

---

## Features

- **No Model Retraining:** Uses a frozen face embedding model (`buffalo_sc`). Contact registration is simply computing and caching embeddings.
- **Privacy-First Storage:** Raw contact face images are stored on your private mobile SQLite database, only forwarded to the backend upon synchronization.
- **Smart Audio Routing:** Automatically checks for Bluetooth audio connections. If earbuds are connected, contact names are spoken out loud via Text-to-Speech (TTS). If not, silent push notifications are sent to the device.
- **Alert Cooldowns:** To avoid notification spam, recognized contacts enter a customizable cooldown period (e.g., 60 minutes) during which identical detections will be subdued.
- **Standalone CLI Utility:** The server includes a fully functional CLI for offline database management, directory watching, and live localized web-cam previews.

---

## How to Run

### 1. Start the Server (Backend)

1. Check that you have Python 3.8+ installed. Navigate to the project root and install the required packages (using a virtual environment is highly recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\\Scripts\\activate
   pip install -r requirements.txt
   ```
2. Start the Flask backend:
   ```bash
   python server/app.py
   ```
   The server will run on `0.0.0.0:8000` by default. Note your machine's local IP address if you plan to connect from a physical mobile device.

### 2. Start the Mobile App (Frontend)

1. Open a new terminal instance and navigate to the `client/` directory.
2. Install the Node modules:
   ```bash
   cd client
   npm install
   ```
3. Start the Expo development server:
   ```bash
   npm expo start
   ```
4. Download the **Expo Go** app on your physical iOS or Android device. Scan the QR code presented in the terminal to launch the app.

---

## API Summary

- `GET /api/contacts` — List all synchronized contacts from the server.
- `POST /api/contacts` / `PUT /api/contacts/<id>` — Add or update contact names.
- `DELETE /api/contacts/<id>` — Remove a contact and discard their embeddings.
- `POST /api/training/contacts/<int:db_id>/images` — Upload actual face imagery for embedding extraction.
- `POST /api/stream/frame` — Upload a single video frame for processing and face recognition.

---

## Technology Stack

- **Backend:** Python, Flask, OpenCV, InsightFace, SQLAlchemy
- **Frontend:** React Native, Expo (Router, SQLite, Audio, Notifications, Speech)
- **Database:** SQLite

---