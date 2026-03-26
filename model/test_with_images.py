import argparse
import os
import sys
import time

import cv2
import numpy as np

from .models.embedding_store import EmbeddingStore
from .services.face_recognition import FaceRecognitionPipeline
from .services.cooldown import CooldownTracker
from .config import TARGET_FPS


SUPPORTED_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def load_images_from_dir(directory: str) -> list[tuple[str, np.ndarray]]:
    results = []
    for fname in sorted(os.listdir(directory)):
        if os.path.splitext(fname)[1].lower() not in SUPPORTED_EXT:
            continue
        path = os.path.join(directory, fname)
        img = cv2.imread(path)
        if img is not None:
            results.append((fname, img))
    return results


def draw_boxes(frame: np.ndarray, matches: list[dict]) -> np.ndarray:
    annotated = frame.copy()
    for m in matches:
        x1, y1, x2, y2 = m["bbox"]
        if m.get("name"):
            color = (0, 255, 0)
            label = f"{m['name']} ({m['confidence']:.0%})"
        else:
            color = (0, 0, 255)
            label = "Unknown"
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        cv2.putText(annotated, label, (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
    return annotated


def detect_and_match(frame: np.ndarray, pipeline: FaceRecognitionPipeline) -> list[dict]:
    faces = pipeline.detect_faces(frame)
    results = []
    for face in faces:
        match = pipeline.match_face(face["embedding"])
        results.append({
            "bbox": face["bbox"],
            "name": match["name"] if match else None,
            "confidence": match["confidence"] if match else 0,
            "x_center": face["x_center"],
            "contact_id": match["contact_id"] if match else None,
        })
    return results


def register_contacts(faces_dir: str, pipeline: FaceRecognitionPipeline, store: EmbeddingStore):
    if not os.path.isdir(faces_dir):
        print(f"Error: '{faces_dir}' directory not found.")
        print(f"Create it and add a subfolder per person with their face photos.")
        sys.exit(1)

    entries = sorted(os.listdir(faces_dir))
    person_dirs = [
        e for e in entries
        if os.path.isdir(os.path.join(faces_dir, e)) and e.lower() != "test"
    ]

    if not person_dirs:
        print(f"No person folders found in '{faces_dir}/'.")
        print(f"Create a subfolder per person (e.g. '{faces_dir}/alice/') with their photos.")
        sys.exit(1)

    print(f"\n{'='*50}")
    print(f" REGISTERING CONTACTS from '{faces_dir}/'")
    print(f"{'='*50}\n")

    for person_name in person_dirs:
        person_path = os.path.join(faces_dir, person_name)
        images = load_images_from_dir(person_path)

        if not images:
            print(f"  [{person_name}] No images found, skipping.")
            continue

        print(f"  [{person_name}] Loading {len(images)} image(s)... ", end="", flush=True)

        bgr_images = [img for _, img in images]
        embeddings = pipeline.generate_embeddings(bgr_images)

        if not embeddings:
            print(f"FAILED (no faces detected in any image)")
            continue

        contact_id = person_name.lower().replace(" ", "_")
        store.add_contact(contact_id, person_name, embeddings)
        print(f"OK ({len(embeddings)}/{len(images)} faces embedded)")

    contacts = store.list_contacts()
    print(f"\n  Total contacts registered: {len(contacts)}")
    for c in contacts:
        print(f"    - {c['name']} ({c['embeddings_count']} embeddings)")
    print()


def test_images(test_dir: str, pipeline: FaceRecognitionPipeline, cooldown: CooldownTracker):
    if not os.path.isdir(test_dir):
        print(f"No test directory found at '{test_dir}'. Skipping image tests.")
        return

    images = load_images_from_dir(test_dir)
    if not images:
        print(f"No images found in '{test_dir}/'.")
        return

    print(f"\n{'='*50}")
    print(f" TESTING RECOGNITION on '{test_dir}/'")
    print(f"{'='*50}\n")

    for fname, frame in images:
        print(f"  Image: {fname}")
        cooldown.reset()

        detections = pipeline.process_frame(frame)
        detections = cooldown.filter_detections(detections)

        if not detections:
            print(f"    No known contacts detected.\n")
        else:
            for det in detections:
                print(f"    -> {det['name']}  confidence={det['confidence']:.2%}  x={det['x_position']}")
            print()

        matches = detect_and_match(frame, pipeline)
        annotated = draw_boxes(frame, matches)
        cv2.imshow(f"IRIS - {fname}", annotated)
        print(f"    Showing result window. Press any key to continue...")
        cv2.waitKey(0)
        cv2.destroyAllWindows()


def test_single_image(image_path: str, pipeline: FaceRecognitionPipeline, cooldown: CooldownTracker):
    frame = cv2.imread(image_path)
    if frame is None:
        print(f"Error: could not read '{image_path}'.")
        sys.exit(1)

    print(f"\n{'='*50}")
    print(f" TESTING: {image_path}")
    print(f"{'='*50}\n")

    detections = pipeline.process_frame(frame)
    detections = cooldown.filter_detections(detections)

    if not detections:
        print("  No known contacts detected.")
    else:
        for det in detections:
            print(f"  -> {det['name']}  confidence={det['confidence']:.2%}  x={det['x_position']}")

    matches = detect_and_match(frame, pipeline)
    annotated = draw_boxes(frame, matches)
    cv2.imshow("IRIS - Result", annotated)
    print("\n  Press any key to close...")
    cv2.waitKey(0)
    cv2.destroyAllWindows()


def test_webcam(pipeline: FaceRecognitionPipeline, cooldown: CooldownTracker):
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: could not open webcam.")
        sys.exit(1)

    print(f"\n{'='*50}")
    print(f" LIVE WEBCAM TEST")
    print(f" Press 'q' to quit, 'r' to reset cooldowns")
    print(f"{'='*50}\n")

    frame_interval = 1.0 / TARGET_FPS if TARGET_FPS > 0 else 0
    last_time = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        now = time.time()
        if now - last_time < frame_interval:
            continue
        last_time = now

        last_matches = detect_and_match(frame, pipeline)

        named = [m for m in last_matches if m.get("name")]
        active = cooldown.filter_detections(named)
        for det in active:
            print(f"  Detected: {det['name']} ({det['confidence']:.0%})")

        annotated = draw_boxes(frame, last_matches)
        cv2.imshow("IRIS - Live", annotated)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        elif key == ord("r"):
            cooldown.reset()
            print("  Cooldowns reset.")

    cap.release()
    cv2.destroyAllWindows()


def main():
    parser = argparse.ArgumentParser(
        description="Test IRIS face recognition with your own images",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example folder setup:
  test_faces/
    alice/          <- put Alice's face photos here
      photo1.jpg
      photo2.jpg
    bob/            <- put Bob's face photos here
      photo1.jpg
    test/           <- put test images here
      group.jpg
        """,
    )
    parser.add_argument(
        "--faces-dir", default="faces",
        help="Directory with person subfolders and test/ subfolder (default: faces)",
    )
    parser.add_argument(
        "--image", help="Path to a single image to test recognition on",
    )
    parser.add_argument(
        "--webcam", action="store_true",
        help="Run live recognition from webcam",
    )
    parser.add_argument(
        "--threshold", type=float, default=None,
        help="Override recognition threshold (default from config)",
    )
    args = parser.parse_args()

    if args.threshold is not None:
        from . import config as cfg
        cfg.RECOGNITION_THRESHOLD = args.threshold
        print(f"Recognition threshold set to {args.threshold}")

    store_path = os.path.join(os.path.dirname(__file__), "data", "test_embeddings.pkl")
    store = EmbeddingStore(store_path=store_path)
    pipeline = FaceRecognitionPipeline(store)
    cooldown = CooldownTracker(cooldown_seconds=5)

    register_contacts(args.faces_dir, pipeline, store)

    if args.image:
        test_single_image(args.image, pipeline, cooldown)
    elif args.webcam:
        test_webcam(pipeline, cooldown)
    else:
        test_dir = os.path.join(args.faces_dir, "test")
        test_images(test_dir, pipeline, cooldown)


if __name__ == "__main__":
    main()
