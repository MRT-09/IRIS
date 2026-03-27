import argparse
import os
import sys
import uuid

import cv2

from .config import RECOGNITION_THRESHOLD
from .models.embedding_store import EmbeddingStore
from .services.cooldown import CooldownTracker
from .services.face_recognition import FaceRecognitionPipeline

SUPPORTED_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
DEFAULT_FACES_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "faces")


def build_pipeline() -> tuple[FaceRecognitionPipeline, EmbeddingStore, CooldownTracker]:
    store = EmbeddingStore()
    pipeline = FaceRecognitionPipeline(store)
    cooldown = CooldownTracker()
    return pipeline, store, cooldown


def auto_register(pipeline: FaceRecognitionPipeline, store: EmbeddingStore, faces_dir: str = DEFAULT_FACES_DIR):
    faces_dir = os.path.abspath(faces_dir)
    if not os.path.isdir(faces_dir):
        return

    for name in sorted(os.listdir(faces_dir)):
        person_dir = os.path.join(faces_dir, name)
        if not os.path.isdir(person_dir) or name.lower() == "test":
            continue

        contact_id = name.lower().replace(" ", "_")
        if store.get_contact(contact_id):
            continue

        images = []
        for fname in sorted(os.listdir(person_dir)):
            if os.path.splitext(fname)[1].lower() not in SUPPORTED_EXT:
                continue
            img = cv2.imread(os.path.join(person_dir, fname))
            if img is not None:
                images.append(img)

        if not images:
            continue

        embeddings = pipeline.generate_embeddings(images)
        if embeddings:
            store.add_contact(contact_id, name, embeddings)
            print(f"  Registered '{name}' ({len(embeddings)}/{len(images)} faces embedded)")



def cmd_register(args):
    pipeline, store, _ = build_pipeline()

    images = []
    for path in args.images:
        img = cv2.imread(path)
        if img is None:
            print(f"Warning: could not read image '{path}', skipping.")
            continue
        images.append(img)

    if not images:
        print("Error: no valid images provided.")
        sys.exit(1)

    contact_id = args.id or str(uuid.uuid4())
    embeddings = pipeline.generate_embeddings(images)

    if not embeddings:
        print("Error: no faces detected in any of the provided images.")
        sys.exit(1)

    store.add_contact(contact_id, args.name, embeddings)
    print(f"Registered '{args.name}' (id={contact_id}) with {len(embeddings)} embedding(s).")


def cmd_remove(args):
    _, store, _ = build_pipeline()
    store.remove_contact(args.id)
    print(f"Removed contact '{args.id}'.")


def cmd_list(_args):
    _, store, _ = build_pipeline()
    contacts = store.list_contacts()
    if not contacts:
        print("No contacts registered.")
        return
    for c in contacts:
        print(f"  {c['contact_id']}  {c['name']}  ({c['embeddings_count']} embeddings)")


def cmd_recognize(args):
    pipeline, store, cooldown = build_pipeline()
    auto_register(pipeline, store)

    frame = cv2.imread(args.image)
    if frame is None:
        print(f"Error: could not read image '{args.image}'.")
        sys.exit(1)

    faces = pipeline.detect_faces(frame)
    print(f"Faces detected: {len(faces)}")

    if not faces:
        print("No faces found in the image. Try a clearer, front-facing photo.")
        return

    all_embeddings = pipeline.store.all_embeddings()
    print(f"Stored embeddings: {len(all_embeddings)}")

    if not all_embeddings:
        print("No contacts registered. Run 'register' first.")
        return

    for i, face in enumerate(faces):
        match = pipeline.match_face(face["embedding"], all_embeddings)
        if match:
            print(f"  Face {i+1}: {match['name']} (confidence={match['confidence']:.2f})")
        else:
            best_dist = min(
                pipeline._cosine_distance(face["embedding"], emb)
                for _, _, emb in all_embeddings
            )
            print(f"  Face {i+1}: no match (best distance={best_dist:.4f}, threshold={RECOGNITION_THRESHOLD})")

    detections = pipeline.process_frame(frame)
    detections = cooldown.filter_detections(detections)

    if not detections:
        print("No known contacts detected above threshold.")
        return

    print("Detected contacts (left to right):")
    for det in detections:
        print(f"  {det['name']} (confidence={det['confidence']:.2f}, x={det['x_position']})")


def cmd_live(_args):
    pipeline, store, cooldown = build_pipeline()
    auto_register(pipeline, store)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: could not open webcam.")
        sys.exit(1)

    print("Running live recognition. Press 'q' to quit.")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        detections = pipeline.process_frame(frame)
        detections = cooldown.filter_detections(detections)

        for det in detections:
            print(f"  Detected: {det['name']} (confidence={det['confidence']:.2f})")

        faces = pipeline.detect_faces(frame)
        for face in faces:
            x1, y1, x2, y2 = face["bbox"]
            match = pipeline.match_face(face["embedding"])
            color = (0, 255, 0) if match else (0, 0, 255)
            label = match["name"] if match else "Unknown"
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

        cv2.imshow("IRIS - Live Recognition", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()



def main():
    parser = argparse.ArgumentParser(description="IRIS face recognition pipeline (standalone)")
    sub = parser.add_subparsers(dest="command", required=True)

    p_reg = sub.add_parser("register", help="Register a new contact")
    p_reg.add_argument("--id", help="Contact ID (auto-generated if omitted)")
    p_reg.add_argument("--name", required=True, help="Contact name")
    p_reg.add_argument("--images", nargs="+", required=True, help="Paths to face images")
    p_reg.set_defaults(func=cmd_register)

    p_rm = sub.add_parser("remove", help="Remove a contact")
    p_rm.add_argument("--id", required=True, help="Contact ID to remove")
    p_rm.set_defaults(func=cmd_remove)

    p_ls = sub.add_parser("list", help="List registered contacts")
    p_ls.set_defaults(func=cmd_list)

    p_rec = sub.add_parser("recognize", help="Recognize faces in an image")
    p_rec.add_argument("--image", required=True, help="Path to image file")
    p_rec.set_defaults(func=cmd_recognize)

    p_live = sub.add_parser("live", help="Live webcam recognition")
    p_live.set_defaults(func=cmd_live)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
