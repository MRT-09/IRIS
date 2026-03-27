import cv2
import numpy as np

from ..config import (
    DETECTION_CONFIDENCE,
    EMBEDDING_MODEL,
    RECOGNITION_THRESHOLD,
)
from ..models.embedding_store import EmbeddingStore


class FaceRecognitionPipeline:
    def __init__(self, embedding_store: EmbeddingStore):
        self.store = embedding_store
        self._detector = None
        self._embedder = None
        self._init_models()

    def _init_models(self):
        if EMBEDDING_MODEL == "insightface":
            self._init_insightface()
        else:
            self._init_face_recognition()

    def _init_insightface(self):
        from insightface.app import FaceAnalysis

        self._app = FaceAnalysis(
            name="buffalo_sc",
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        self._app.prepare(ctx_id=0, det_size=(320, 320))

    def _init_face_recognition(self):
        import face_recognition as fr

        self._fr = fr

    def detect_faces(self, frame: np.ndarray) -> list[dict]:
        if EMBEDDING_MODEL == "insightface":
            return self._detect_insightface(frame)
        return self._detect_face_recognition(frame)

    def _detect_insightface(self, frame: np.ndarray) -> list[dict]:
        faces = self._app.get(frame)
        results = []
        for face in faces:
            if face.det_score < DETECTION_CONFIDENCE:
                continue
            x1, y1, x2, y2 = face.bbox.astype(int)
            results.append(
                {
                    "bbox": (int(x1), int(y1), int(x2), int(y2)),
                    "embedding": face.embedding / np.linalg.norm(face.embedding),
                    "x_center": int((x1 + x2) / 2),
                }
            )
        return results

    def _detect_face_recognition(self, frame: np.ndarray) -> list[dict]:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        locations = self._fr.face_locations(rgb, model="hog")
        encodings = self._fr.face_encodings(rgb, known_face_locations=locations)
        results = []
        for (top, right, bottom, left), enc in zip(locations, encodings):
            results.append(
                {
                    "bbox": (left, top, right, bottom),
                    "embedding": enc / np.linalg.norm(enc),
                    "x_center": int((left + right) / 2),
                }
            )
        return results

    def generate_embeddings(self, images: list[np.ndarray]) -> list[np.ndarray]:
        embeddings = []
        for img in images:
            faces = self.detect_faces(img)
            if faces:
                embeddings.append(faces[0]["embedding"])
        return embeddings

    def match_face(
        self,
        embedding: np.ndarray,
        all_embeddings: list[tuple[str, str, np.ndarray]] | None = None,
    ) -> dict | None:
        if all_embeddings is None:
            all_embeddings = self.store.all_embeddings()

        best_match = None
        best_distance = float("inf")

        for contact_id, name, stored_emb in all_embeddings:
            dist = self._cosine_distance(embedding, stored_emb)
            if dist < best_distance:
                best_distance = dist
                best_match = {"contact_id": contact_id, "name": name}

        if best_match and best_distance < RECOGNITION_THRESHOLD:
            best_match["confidence"] = round(1.0 - best_distance, 4)
            return best_match
        return None

    def process_frame(self, frame: np.ndarray) -> list[dict]:
        faces = self.detect_faces(frame)
        faces.sort(key=lambda f: f["x_center"])

        all_embeddings = self.store.all_embeddings()
        seen: dict[str, dict] = {}
        for face in faces:
            match = self.match_face(face["embedding"], all_embeddings)
            if match:
                cid = match["contact_id"]
                match["x_position"] = face["x_center"]
                prev = seen.get(cid)
                if prev is None or match["confidence"] > prev["confidence"]:
                    seen[cid] = match

        detections = sorted(seen.values(), key=lambda d: d["x_position"])
        return detections

    @staticmethod
    def _cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
        return 1.0 - float(np.dot(a, b))
