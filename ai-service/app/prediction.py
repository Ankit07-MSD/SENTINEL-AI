"""
Risk Predictor: predicts relative emergency risk for a zone/time-window using
historical incident data (Section 7). Loads a trained model if available,
otherwise falls back to a documented historical-frequency heuristic so the
API is runnable before Phase 4 training data is ready.
"""
import os
import pickle
from collections import defaultdict

TIME_WINDOWS = ["morning", "afternoon", "evening", "night"]


class RiskPredictor:
    def __init__(self, model_path: str):
        self.model = None
        if os.path.exists(model_path):
            with open(model_path, "rb") as f:
                self.model = pickle.load(f)

        # in-memory placeholder store until Postgres/historical CSV is wired in
        # (Phase 5 will replace this with a real DB-backed lookup)
        self._history = defaultdict(list)

    def predict(self, req: dict) -> dict:
        zone = req["zone_name"]
        time_window = req.get("time_window", "morning")
        risk_type = req.get("risk_type", "fire")

        if self.model is not None:
            features = self._build_features(req)
            score = float(self.model.predict([features])[0])
        else:
            score = self._heuristic_score(zone, time_window, risk_type)

        return {
            "zone_name": zone,
            "risk_type": risk_type,
            "time_window": time_window,
            "risk_score": round(max(0, min(100, score)), 2),
            "note": "heuristic fallback" if self.model is None else "model prediction",
        }

    def full_heatmap(self) -> dict:
        """Returns risk scores across all tracked zones/time-windows for the map."""
        # placeholder until historical dataset (Phase 2) + trained model (Phase 4) exist
        return {"zones": [], "note": "heatmap will populate once historical data + model are added"}

    def _build_features(self, req: dict):
        # matches the feature order train_risk_predictor.py will use
        return [hash(req["zone_name"]) % 100, TIME_WINDOWS.index(req.get("time_window", "morning"))]

    def _heuristic_score(self, zone, time_window, risk_type):
        base = {"fire": 40, "accident": 50, "flood": 30, "crowd_anomaly": 35}.get(risk_type, 30)
        time_adjust = {"morning": 5, "afternoon": 0, "evening": 10, "night": -5}.get(time_window, 0)
        return base + time_adjust
