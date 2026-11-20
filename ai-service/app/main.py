"""
Sentinel AI — AI/ML Inference Service (FastAPI)

Exposes three core endpoints consumed by the Node.js backend:
    POST /ai/detect     -> Computer Vision emergency detection (YOLO)
    POST /ai/severity   -> Severity + risk scoring (trained ML model)
    POST /ai/predict     -> Historical risk prediction (heatmap data)

Run:
    uvicorn app.main:app --reload --port 8000
"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from pathlib import Path

from app.detection import DetectionPipeline
from app.severity import SeverityEngine
from app.prediction import RiskPredictor

app = FastAPI(title="Sentinel AI - Inference Service", version="0.1.0")
MODEL_DIR = Path(__file__).resolve().parents[1] / "models"
FIVE_CLASS_MODEL = MODEL_DIR / "sentinel_yolo11_5class.pt"
LEGACY_MODEL = MODEL_DIR / "sentinel_yolo11.pt"
DETECTOR_MODEL = FIVE_CLASS_MODEL if FIVE_CLASS_MODEL.exists() else LEGACY_MODEL

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restrict to backend URL in production
    allow_methods=["*"],
    allow_headers=["*"],
)

detection_pipeline = DetectionPipeline(
    model_path=str(DETECTOR_MODEL),
    conf_threshold=0.55,
    consecutive_frames_required=4,
)
severity_engine = SeverityEngine(model_path=str(MODEL_DIR / "severity_model.pkl"))
risk_predictor = RiskPredictor(model_path=str(MODEL_DIR / "risk_predictor.pkl"))


@app.post("/ai/detect")
async def detect(video: UploadFile = File(...)):
    """
    Accepts an uploaded video/clip, runs frame-by-frame YOLO detection with
    multi-frame temporal verification, and returns a VERIFIED or REJECTED
    event with explainability metadata. See app/detection.py for the pipeline.
    """
    if not video.content_type.startswith("video"):
        raise HTTPException(400, "Please upload a video file")

    contents = await video.read()
    result = detection_pipeline.run(contents)
    return result


@app.post("/ai/detect-frame")
async def detect_frame(image: UploadFile = File(...)):
    """
    Live-camera mode: accepts ONE image (a frame captured from a phone/laptop
    camera in the browser) and returns immediate per-class detections above
    the confidence threshold. The frontend calls this repeatedly (~every 1.5s)
    and does its own consecutive-frame verification client-side, mirroring
    the video pipeline's false-alarm-reduction logic.

    Uses a lower confidence threshold (0.35) than the video-upload pipeline
    (0.55) — real-time webcam frames vary more in lighting/angle than curated
    clips, so a stricter threshold made live demos miss too often.
    """
    contents = await image.read()
    detections = detection_pipeline.infer_single_image(contents, conf_threshold=0.35)
    return {"detections": detections}


class SeverityRequest(BaseModel):
    incident_type: str
    detection_confidence: float = Field(ge=0, le=100)
    frames_confirmed: int = Field(ge=0)
    people_count: Optional[int] = Field(default=0, ge=0)
    vehicle_count: Optional[int] = Field(default=0, ge=0)
    location_population_density: Optional[float] = Field(default=None, ge=0, le=100)
    time_of_day: Optional[str] = None
    weather: Optional[str] = None
    nearby_critical_infra: Optional[bool] = False
    historical_incident_count: Optional[int] = Field(default=0, ge=0)


@app.post("/ai/severity")
async def severity(req: SeverityRequest):
    """Computes severity_score, risk_score, priority and explanation array."""
    result = severity_engine.score(req.dict())
    return result


class PredictionRequest(BaseModel):
    zone_name: str
    latitude: float
    longitude: float
    time_window: str
    risk_type: Optional[str] = None


@app.post("/ai/predict")
async def predict(req: PredictionRequest):
    result = risk_predictor.predict(req.dict())
    return result


@app.get("/ai/predict/heatmap")
async def heatmap():
    return risk_predictor.full_heatmap()


@app.get("/health")
def health():
    return {"status": "ok"}
