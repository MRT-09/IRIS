import os
import pickle
import threading
from typing import Optional

import numpy as np

from ..config import EMBEDDING_STORE_PATH


class EmbeddingStore:
    def __init__(self, store_path: str = EMBEDDING_STORE_PATH):
        self._store_path = store_path
        self._lock = threading.Lock()
        self._data: dict[str, dict] = {}
        self._load()

    def _load(self):
        if os.path.exists(self._store_path):
            with open(self._store_path, "rb") as f:
                self._data = pickle.load(f)

    def _save(self):
        os.makedirs(os.path.dirname(self._store_path), exist_ok=True)
        with open(self._store_path, "wb") as f:
            pickle.dump(self._data, f)

    def add_contact(self, contact_id: str, name: str, embeddings: list[np.ndarray]):
        with self._lock:
            self._data[contact_id] = {
                "name": name,
                "embeddings": embeddings,
            }
            self._save()

    def remove_contact(self, contact_id: str):
        with self._lock:
            self._data.pop(contact_id, None)
            self._save()

    def get_contact(self, contact_id: str) -> Optional[dict]:
        with self._lock:
            return self._data.get(contact_id)

    def list_contacts(self) -> list[dict]:
        with self._lock:
            return [
                {
                    "contact_id": cid,
                    "name": info["name"],
                    "embeddings_count": len(info["embeddings"]),
                }
                for cid, info in self._data.items()
            ]

    def all_embeddings(self) -> list[tuple[str, str, np.ndarray]]:
        with self._lock:
            results = []
            for cid, info in self._data.items():
                for emb in info["embeddings"]:
                    results.append((cid, info["name"], emb))
            return results
