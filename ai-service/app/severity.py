"""
Severity Engine: turns incident features into severity, contextual risk,
priority, and a human-readable explanation. The current project path uses a
documented weighted fallback; an optional trained model is loaded when a
compatible artifact is supplied. The fallback should not be reported as a
supervised machine-learning model.
"""
import os
import pickle
import numpy as np

TYPE_BASE_WEIGHT = {
    "fire": 0.85, "smoke": 0.55, "accident": 0.70, "fallen_person": 0.45,
    "crowd_anomaly": 0.50, "road_blockage": 0.35, "flood": 0.65, "other": 0.30,
}

FEATURE_ORDER = [
    "detection_confidence", "frames_confirmed", "people_count", "vehicle_count",
    "location_population_density", "nearby_critical_infra", "historical_incident_count",
    "type_weight",
]


class SeverityEngine:
    def __init__(self, model_path: str):
        self.model = None
        if os.path.exists(model_path):
            with open(model_path, "rb") as f:
                self.model = pickle.load(f)

    def score(self, features: dict) -> dict:
        vec, explanation_bits = self._build_feature_vector(features)

        if self.model is not None:
            severity = float(self.model.predict([vec])[0])
            severity = max(0, min(100, severity))
        else:
            # documented fallback heuristic — replace once train_severity_model.py
            # produces model.pkl (see training/README.md)
            severity = self._rule_based_fallback(vec)

        risk_score = self._risk_from_context(severity, features)
        priority = self._priority_bucket(risk_score)
        explanation = self._explain(features, severity, risk_score)

        return {
            "severity_score": round(severity, 2),
            "risk_score": round(risk_score, 2),
            "priority": priority,
            "explanation": explanation,
        }

    def _build_feature_vector(self, f: dict):
        type_weight = TYPE_BASE_WEIGHT.get(f.get("incident_type", "other"), 0.3)
        confidence = self._clamp(float(f.get("detection_confidence") or 0), 0, 100)
        frames = self._clamp(float(f.get("frames_confirmed") or 0), 0, 10)
        people = self._clamp(float(f.get("people_count") or 0), 0, 50)
        vehicles = self._clamp(float(f.get("vehicle_count") or 0), 0, 10)
        density = self._clamp(float(f.get("location_population_density") or 0), 0, 100)
        history = self._clamp(float(f.get("historical_incident_count") or 0), 0, 20)
        vec = [
            confidence / 100.0,
            frames / 10.0,
            people / 50.0,
            vehicles / 10.0,
            density / 100.0,
            1.0 if f.get("nearby_critical_infra") else 0.0,
            history / 20.0,
            type_weight,
        ]
        return vec, FEATURE_ORDER

    @staticmethod
    def _clamp(value, minimum, maximum):
        return max(minimum, min(maximum, value))

    def _rule_based_fallback(self, vec):
        weights = [30, 10, 15, 5, 10, 10, 5, 15]  # sums to 100, documented in report
        return float(np.dot(vec, weights))

    def _risk_from_context(self, severity, f):
        # risk = severity adjusted by contextual multipliers (density, infra, history)
        multiplier = 1.0
        if f.get("nearby_critical_infra"):
            multiplier += 0.10
        if (f.get("historical_incident_count") or 0) > 10:
            multiplier += 0.05
        return max(0, min(100, severity * multiplier))

    def _priority_bucket(self, risk_score):
        if risk_score <= 30:
            return "LOW"
        elif risk_score <= 60:
            return "MEDIUM"
        elif risk_score <= 80:
            return "HIGH"
        return "CRITICAL"

    def _explain(self, f, severity, risk_score):
        reasons = []
        if f.get("detection_confidence", 0) >= 85:
            reasons.append(f"High detection confidence ({f['detection_confidence']}%)")
        if f.get("frames_confirmed", 0) >= 5:
            reasons.append(f"Confirmed across {f['frames_confirmed']} consecutive frames")
        if f.get("people_count", 0) >= 10:
            reasons.append(f"High number of people nearby ({f['people_count']})")
        if f.get("nearby_critical_infra"):
            reasons.append("Located near critical infrastructure")
        if (f.get("historical_incident_count") or 0) > 10:
            reasons.append("Area has elevated historical incident frequency")
        if not reasons:
            reasons.append("Baseline risk factors for this incident type")
        return reasons
