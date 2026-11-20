"""
Detection Pipeline: YOLO inference + multi-frame temporal verification.

Pipeline:
    video bytes -> frame extraction (cv2) -> preprocessing -> YOLO inference
    per frame -> per-class confidence tracking across frames -> verification
    decision (reduces false positives from single noisy frames)

This pipeline loads the trained Sentinel YOLO11 checkpoint configured in
app/main.py. The pretrained 'yolo11n.pt' checkpoint can be used for pipeline
smoke checks, but it has generic COCO classes rather than Sentinel classes.
"""
import io
import tempfile
from collections import defaultdict

import cv2
import numpy as np
from ultralytics import YOLO

CLASS_NAMES = ["fire", "smoke", "accident", "fallen_person", "crowd_anomaly"]
LEGACY_CLASS_NAMES = CLASS_NAMES + ["road_blockage"]


class DetectionPipeline:
    def __init__(self, model_path: str, conf_threshold: float = 0.55,
                 consecutive_frames_required: int = 4, frame_sample_rate: int = 5):
        """
        conf_threshold: minimum YOLO confidence to even count a frame as a "hit"
        consecutive_frames_required: how many *separate* sampled frames must
            independently detect the same class before we call it VERIFIED.
            This is the core false-alarm-reduction mechanism (Section 5).
        frame_sample_rate: analyze every Nth frame (full-fps analysis is wasteful)
        """
        self.model = YOLO(model_path)
        loaded_names = list(self.model.names.values())
        if loaded_names not in (CLASS_NAMES, LEGACY_CLASS_NAMES):
            raise ValueError(
                "Loaded detector classes do not match Sentinel AI's supported "
                f"class order. Expected {CLASS_NAMES} (or the six-class legacy "
                f"checkpoint {LEGACY_CLASS_NAMES}), received {loaded_names}."
            )
        # A legacy checkpoint still contains an untrained road_blockage output.
        # Restrict inference to the five classes with labelled training data.
        self.detect_class_ids = list(range(len(CLASS_NAMES)))
        self.conf_threshold = conf_threshold
        self.consecutive_frames_required = consecutive_frames_required
        self.frame_sample_rate = frame_sample_rate

    def run(self, video_bytes: bytes) -> dict:
        with tempfile.NamedTemporaryFile(suffix=".mp4") as tmp:
            tmp.write(video_bytes)
            tmp.flush()
            cap = cv2.VideoCapture(tmp.name)

            frame_idx = 0
            hit_streak = defaultdict(int)      # class -> current consecutive hit count
            max_streak = defaultdict(int)       # class -> best streak observed
            confidences = defaultdict(list)     # class -> list of confidences on hit frames

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                if frame_idx % self.frame_sample_rate == 0:
                    detections = self._infer_frame(frame)
                    seen_this_frame = set()

                    # crowd_anomaly needs several people in the SAME frame, not
                    # just one (see infer_single_image's docstring for why)
                    crowd_count = sum(1 for cls, conf in detections if cls == "crowd_anomaly" and conf >= self.conf_threshold)
                    MIN_CROWD_BOXES = 3

                    for cls_name, conf in detections:
                        if conf < self.conf_threshold:
                            continue
                        if cls_name == "crowd_anomaly" and crowd_count < MIN_CROWD_BOXES:
                            continue
                        hit_streak[cls_name] += 1
                        confidences[cls_name].append(conf)
                        max_streak[cls_name] = max(max_streak[cls_name], hit_streak[cls_name])
                        seen_this_frame.add(cls_name)
                    # reset streak for classes not seen this sampled frame
                    for cls_name in list(hit_streak.keys()):
                        if cls_name not in seen_this_frame:
                            hit_streak[cls_name] = 0
                frame_idx += 1
            cap.release()

        # Decide verification
        verified_events = []
        for cls_name, streak in max_streak.items():
            if streak >= self.consecutive_frames_required:
                avg_conf = float(np.mean(confidences[cls_name]))
                verified_events.append({
                    "type": cls_name,
                    "confidence": round(avg_conf * 100, 2),
                    "frames_confirmed": streak,
                    "status": "VERIFIED",
                })

        return {
            "frames_analyzed": frame_idx // self.frame_sample_rate,
            "verified_events": verified_events,
            "verified": len(verified_events) > 0,
        }

    def _infer_frame(self, frame: np.ndarray):
        """Runs YOLO on one frame, returns list of (class_name, confidence)."""
        results = self.model.predict(
            frame, verbose=False, classes=self.detect_class_ids
        )[0]
        out = []
        for box in results.boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            cls_name = results.names.get(cls_id, str(cls_id))
            out.append((cls_name, conf))
        return out

    def infer_single_image(self, image_bytes: bytes, conf_threshold: float = None) -> list:
        """
        Runs YOLO on ONE standalone image (used by live-camera mode, where the
        frontend captures a frame every ~1.5s and streams it here instead of
        uploading a full video). Multi-frame consecutive verification is done
        client-side for this mode — see the Live Camera page.

        conf_threshold overrides the pipeline's default (used to make live
        webcam demos more forgiving than the stricter video-upload path,
        since real-time lighting/angle varies more than curated clips).

        NOTE on crowd_anomaly: the underlying model was trained on a
        person-PRESENCE dataset (not a true crowd-density/behavior dataset —
        see project docs), so a single person triggers it. As a practical
        mitigation without retraining, we only report crowd_anomaly when at
        least MIN_CROWD_BOXES separate boxes of that class appear in the SAME
        frame — i.e. requiring several people detected at once before calling
        it a "crowd", rather than any lone person.
        """
        MIN_CROWD_BOXES = 3
        threshold = conf_threshold if conf_threshold is not None else self.conf_threshold
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            return []

        raw_detections = self._infer_frame(frame)
        passing = [(cls, conf) for cls, conf in raw_detections if conf >= threshold]

        crowd_boxes = [(cls, conf) for cls, conf in passing if cls == "crowd_anomaly"]
        other_boxes = [(cls, conf) for cls, conf in passing if cls != "crowd_anomaly"]

        results = [{"type": cls, "confidence": round(conf * 100, 2)} for cls, conf in other_boxes]
        if len(crowd_boxes) >= MIN_CROWD_BOXES:
            best_conf = max(conf for _, conf in crowd_boxes)
            results.append({
                "type": "crowd_anomaly",
                "confidence": round(best_conf * 100, 2),
                "people_detected": len(crowd_boxes),
            })
        return results
