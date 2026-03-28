import cv2
import numpy as np

from config import DETECTION_CONFIDENCE, EMBEDDING_MODEL, RECOGNITION_THRESHOLD

_model = None


def _get_model():
    global _model
    if _model is None:
        if EMBEDDING_MODEL == "insightface":
            from insightface.app import FaceAnalysis
            _model = FaceAnalysis(
                name="buffalo_sc",
                providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
            )
            _model.prepare(ctx_id=0, det_size=(320, 320))
        else:
            import face_recognition as fr
            _model = fr
    return _model


def detect_faces(frame: np.ndarray) -> list[dict]:
    model = _get_model()
    if EMBEDDING_MODEL == "insightface":
        faces = model.get(frame)
        results = []
        for face in faces:
            if face.det_score < DETECTION_CONFIDENCE:
                continue
            x1, y1, x2, y2 = face.bbox.astype(int)
            results.append({
                "bbox": (int(x1), int(y1), int(x2), int(y2)),
                "embedding": face.embedding / np.linalg.norm(face.embedding),
                "x_center": int((x1 + x2) / 2),
            })
        return results
    else:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        locations = model.face_locations(rgb, model="hog")
        encodings = model.face_encodings(rgb, known_face_locations=locations)
        results = []
        for (top, right, bottom, left), enc in zip(locations, encodings):
            results.append({
                "bbox": (left, top, right, bottom),
                "embedding": enc / np.linalg.norm(enc),
                "x_center": int((left + right) / 2),
            })
        return results


def generate_embeddings(images: list[np.ndarray]) -> list[np.ndarray]:
    embeddings = []
    for img in images:
        faces = detect_faces(img)
        if faces:
            embeddings.append(faces[0]["embedding"])
    return embeddings


def match_face(
    embedding: np.ndarray,
    all_embeddings: list[tuple[str, str, np.ndarray]],
) -> dict | None:
    best_match = None
    best_distance = float("inf")
    for contact_id, name, stored_emb in all_embeddings:
        dist = 1.0 - float(np.dot(embedding, stored_emb))
        if dist < best_distance:
            best_distance = dist
            best_match = {"contact_id": contact_id, "name": name}
    if best_match and best_distance < RECOGNITION_THRESHOLD:
        best_match["confidence"] = round(1.0 - best_distance, 4)
        return best_match
    return None


def process_frame(
    frame: np.ndarray,
    all_embeddings: list[tuple[str, str, np.ndarray]],
) -> list[dict]:
    faces = detect_faces(frame)
    faces.sort(key=lambda f: f["x_center"])
    seen: dict[str, dict] = {}
    for face in faces:
        m = match_face(face["embedding"], all_embeddings)
        if m:
            cid = m["contact_id"]
            m["x_position"] = face["x_center"]
            prev = seen.get(cid)
            if prev is None or m["confidence"] > prev["confidence"]:
                seen[cid] = m
    return sorted(seen.values(), key=lambda d: d["x_position"])
