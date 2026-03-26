from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from ..models.embedding_store import EmbeddingStore
from ..services.face_recognition import FaceRecognitionPipeline



def _unit_vec(dim: int = 512, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    v = rng.standard_normal(dim).astype(np.float32)
    return v / np.linalg.norm(v)


def _make_frame(h: int = 480, w: int = 640) -> np.ndarray:
    return np.zeros((h, w, 3), dtype=np.uint8)



@pytest.fixture
def store(tmp_path):
    return EmbeddingStore(store_path=str(tmp_path / "emb.pkl"))


@pytest.fixture
def pipeline(store):
    with patch.object(FaceRecognitionPipeline, "_init_models"):
        p = FaceRecognitionPipeline(store)
    return p



class TestCosineDistance:
    def test_identical_vectors(self):
        v = _unit_vec(seed=1)
        assert FaceRecognitionPipeline._cosine_distance(v, v) == pytest.approx(0.0, abs=1e-6)

    def test_orthogonal_vectors(self):
        a = np.array([1, 0, 0], dtype=np.float32)
        b = np.array([0, 1, 0], dtype=np.float32)
        assert FaceRecognitionPipeline._cosine_distance(a, b) == pytest.approx(1.0, abs=1e-6)

    def test_opposite_vectors(self):
        a = np.array([1, 0], dtype=np.float32)
        b = np.array([-1, 0], dtype=np.float32)
        assert FaceRecognitionPipeline._cosine_distance(a, b) == pytest.approx(2.0, abs=1e-6)

    def test_similar_vectors_small_distance(self):
        a = _unit_vec(seed=10)
        noise = np.random.default_rng(11).standard_normal(512).astype(np.float32) * 0.01
        b = a + noise
        b = b / np.linalg.norm(b)
        dist = FaceRecognitionPipeline._cosine_distance(a, b)
        assert dist < 0.05



class TestMatchFace:
    def test_match_known_contact(self, pipeline, store):
        emb = _unit_vec(seed=1)
        store.add_contact("c1", "Alice", [emb])

        query = emb + np.random.default_rng(99).standard_normal(512).astype(np.float32) * 0.01
        query = query / np.linalg.norm(query)

        result = pipeline.match_face(query)
        assert result is not None
        assert result["contact_id"] == "c1"
        assert result["name"] == "Alice"
        assert result["confidence"] > 0.9

    def test_no_match_for_distant_embedding(self, pipeline, store):
        emb = _unit_vec(seed=1)
        store.add_contact("c1", "Alice", [emb])
        far = np.zeros(512, dtype=np.float32)
        far[0] = 1.0
        if abs(np.dot(emb, far)) > 0.5:
            far[0] = 0.0
            far[1] = 1.0
        result = pipeline.match_face(far)
        assert result is None

    def test_no_match_when_store_empty(self, pipeline):
        result = pipeline.match_face(_unit_vec(seed=5))
        assert result is None

    def test_best_match_wins(self, pipeline, store):
        emb_alice = _unit_vec(seed=1)
        emb_bob = _unit_vec(seed=2)
        store.add_contact("c1", "Alice", [emb_alice])
        store.add_contact("c2", "Bob", [emb_bob])

        query = emb_alice * 0.99 + np.random.default_rng(42).standard_normal(512).astype(np.float32) * 0.001
        query = query / np.linalg.norm(query)
        result = pipeline.match_face(query)
        assert result is not None
        assert result["name"] == "Alice"



class TestProcessFrame:
    def test_process_frame_returns_sorted_left_to_right(self, pipeline, store):
        emb_a = _unit_vec(seed=10)
        emb_b = _unit_vec(seed=20)
        store.add_contact("a", "Alice", [emb_a])
        store.add_contact("b", "Bob", [emb_b])

        fake_faces = [
            {"bbox": (400, 50, 500, 200), "embedding": emb_a, "x_center": 450},
            {"bbox": (50, 50, 150, 200), "embedding": emb_b, "x_center": 100},
        ]
        pipeline.detect_faces = MagicMock(return_value=fake_faces)

        detections = pipeline.process_frame(_make_frame())
        assert len(detections) == 2
        assert detections[0]["name"] == "Bob"
        assert detections[1]["name"] == "Alice"

    def test_process_frame_skips_unknown_faces(self, pipeline, store):
        emb_a = _unit_vec(seed=10)
        store.add_contact("a", "Alice", [emb_a])

        unknown_emb = np.zeros(512, dtype=np.float32)
        unknown_emb[0] = 1.0

        fake_faces = [
            {"bbox": (50, 50, 150, 200), "embedding": emb_a, "x_center": 100},
            {"bbox": (300, 50, 400, 200), "embedding": unknown_emb, "x_center": 350},
        ]
        pipeline.detect_faces = MagicMock(return_value=fake_faces)

        detections = pipeline.process_frame(_make_frame())
        assert len(detections) == 1
        assert detections[0]["name"] == "Alice"

    def test_process_frame_no_faces(self, pipeline):
        pipeline.detect_faces = MagicMock(return_value=[])
        assert pipeline.process_frame(_make_frame()) == []



class TestGenerateEmbeddings:
    def test_generates_from_images(self, pipeline):
        emb = _unit_vec(seed=7)
        fake_face = [{"bbox": (0, 0, 100, 100), "embedding": emb, "x_center": 50}]
        pipeline.detect_faces = MagicMock(return_value=fake_face)

        images = [_make_frame(), _make_frame()]
        result = pipeline.generate_embeddings(images)
        assert len(result) == 2
        np.testing.assert_array_equal(result[0], emb)

    def test_skips_images_with_no_face(self, pipeline):
        pipeline.detect_faces = MagicMock(return_value=[])
        result = pipeline.generate_embeddings([_make_frame()])
        assert result == []
