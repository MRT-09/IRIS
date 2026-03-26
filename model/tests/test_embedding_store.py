import os
import tempfile

import numpy as np
import pytest

from ..models.embedding_store import EmbeddingStore


@pytest.fixture
def store(tmp_path):
    path = str(tmp_path / "embeddings.pkl")
    return EmbeddingStore(store_path=path)


@pytest.fixture
def dummy_embeddings():
    rng = np.random.default_rng(42)
    vecs = [rng.standard_normal(512).astype(np.float32) for _ in range(2)]
    return [v / np.linalg.norm(v) for v in vecs]


class TestAddAndRetrieve:
    def test_add_contact(self, store, dummy_embeddings):
        store.add_contact("c1", "Alice", dummy_embeddings)
        contact = store.get_contact("c1")
        assert contact is not None
        assert contact["name"] == "Alice"
        assert len(contact["embeddings"]) == 2

    def test_get_missing_contact_returns_none(self, store):
        assert store.get_contact("nonexistent") is None

    def test_list_contacts(self, store, dummy_embeddings):
        store.add_contact("c1", "Alice", dummy_embeddings)
        store.add_contact("c2", "Bob", dummy_embeddings[:1])
        contacts = store.list_contacts()
        assert len(contacts) == 2
        names = {c["name"] for c in contacts}
        assert names == {"Alice", "Bob"}

    def test_list_contacts_empty(self, store):
        assert store.list_contacts() == []


class TestUpdate:
    def test_overwrite_contact(self, store, dummy_embeddings):
        store.add_contact("c1", "Alice", dummy_embeddings)
        new_emb = [dummy_embeddings[0]]
        store.add_contact("c1", "Alice Updated", new_emb)
        contact = store.get_contact("c1")
        assert contact["name"] == "Alice Updated"
        assert len(contact["embeddings"]) == 1


class TestRemove:
    def test_remove_existing(self, store, dummy_embeddings):
        store.add_contact("c1", "Alice", dummy_embeddings)
        store.remove_contact("c1")
        assert store.get_contact("c1") is None

    def test_remove_nonexistent_does_not_raise(self, store):
        store.remove_contact("nope")


class TestAllEmbeddings:
    def test_all_embeddings_flat_list(self, store, dummy_embeddings):
        store.add_contact("c1", "Alice", dummy_embeddings)
        store.add_contact("c2", "Bob", dummy_embeddings[:1])
        all_embs = store.all_embeddings()
        assert len(all_embs) == 3
        ids = [cid for cid, _, _ in all_embs]
        assert ids.count("c1") == 2
        assert ids.count("c2") == 1


class TestPersistence:
    def test_data_survives_reload(self, tmp_path, dummy_embeddings):
        path = str(tmp_path / "embeddings.pkl")
        store1 = EmbeddingStore(store_path=path)
        store1.add_contact("c1", "Alice", dummy_embeddings)

        store2 = EmbeddingStore(store_path=path)
        contact = store2.get_contact("c1")
        assert contact is not None
        assert contact["name"] == "Alice"
        assert len(contact["embeddings"]) == 2

    def test_empty_store_loads_cleanly(self, tmp_path):
        path = str(tmp_path / "does_not_exist.pkl")
        store = EmbeddingStore(store_path=path)
        assert store.list_contacts() == []
