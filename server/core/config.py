import os

RECOGNITION_THRESHOLD = float(os.environ.get("IRIS_RECOGNITION_THRESHOLD", "0.5"))

COOLDOWN_SECONDS = int(os.environ.get("IRIS_COOLDOWN_SECONDS", "3600"))

EMBEDDING_MODEL = os.environ.get("IRIS_EMBEDDING_MODEL", "insightface")

EMBEDDING_DIM = 512 if EMBEDDING_MODEL == "insightface" else 128

EMBEDDING_STORE_PATH = os.environ.get(
    "IRIS_EMBEDDING_STORE_PATH",
    os.path.join(os.path.dirname(__file__), "data", "embeddings.pkl"),
)

DETECTION_CONFIDENCE = float(os.environ.get("IRIS_DETECTION_CONFIDENCE", "0.5"))

TARGET_FPS = float(os.environ.get("IRIS_TARGET_FPS", "2"))
