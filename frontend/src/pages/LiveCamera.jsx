import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera } from "lucide-react";
import api from "../services/api";

const AI_SERVICE_URL = "http://localhost:8000";
const CAPTURE_INTERVAL_MS = 1500;
const CONSECUTIVE_FRAMES_REQUIRED = 2; // lowered for live-camera demos — real-time lighting/angle shifts make 3 harder to sustain than in a steady video clip
const DEFAULT_LOCATION = { lat: 28.7041, lng: 77.1025 }; // fallback if browser location is denied

export default function LiveCamera() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streakRef = useRef({}); // { className: consecutiveCount }
  const bestConfRef = useRef({}); // { className: best confidence seen in current streak }
  const locationRef = useRef(DEFAULT_LOCATION);
  const locationWatchRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [locationStatus, setLocationStatus] = useState("Checking device location…");
  const [liveDetections, setLiveDetections] = useState([]);
  const [verifiedEvents, setVerifiedEvents] = useState([]);
  const [error, setError] = useState("");

  const requestDeviceLocation = useCallback(() => {
    if (!window.isSecureContext) {
      setLocationStatus("GPS needs HTTPS or localhost; using demo location (28.7041, 77.1025).");
      return;
    }
    if (!navigator.geolocation) {
      setLocationStatus("Browser GPS is unavailable; using demo location (28.7041, 77.1025).");
      return;
    }
    if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current);
    setLocationStatus("Requesting browser GPS permission…");
    locationWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        locationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const accuracy = Math.round(pos.coords.accuracy);
        setLocationStatus(`Device GPS active · accuracy about ${accuracy} m.`);
      },
      (err) => {
        if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
        locationRef.current = DEFAULT_LOCATION;
        const reason = err.code === 1 ? "permission denied" : err.code === 3 ? "timed out" : "unavailable";
        setLocationStatus(`Browser GPS ${reason}; using demo location (28.7041, 77.1025).`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    requestDeviceLocation();
    return () => {
      if (locationWatchRef.current !== null) navigator.geolocation?.clearWatch(locationWatchRef.current);
    };
  }, [requestDeviceLocation]);

  const startCamera = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      videoRef.current.srcObject = stream;
      setStreaming(true);
    } catch (err) {
      setError("Could not access camera. Check browser permissions.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    setStreaming(false);
    streakRef.current = {};
    setLiveDetections([]);
  }, []);

  /** Creates a real incident in the backend once a class is verified, so it
   * flows through the same pipeline as any other detection — appears on the
   * Dashboard, map, and Analytics, and triggers the real-time Socket.IO
   * update, exactly like a manually- or video-created incident. */
  async function createIncidentFromDetection(type, confidence) {
    try {
      const severityRes = await fetch(`${AI_SERVICE_URL}/ai/severity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incident_type: type,
          detection_confidence: confidence,
          frames_confirmed: CONSECUTIVE_FRAMES_REQUIRED,
        }),
      });
      const severity = await severityRes.json();

      await api.post("/incidents", {
        type,
        latitude: locationRef.current.lat,
        longitude: locationRef.current.lng,
        source: "live_camera",
        detection_confidence: confidence,
        frames_confirmed: CONSECUTIVE_FRAMES_REQUIRED,
        verified: true,
        severity_score: severity.severity_score,
        risk_score: severity.risk_score,
        priority: severity.priority,
        explanation: severity.explanation,
      });
    } catch (err) {
      console.error("Failed to create incident from live detection", err);
    }
  }

  const captureAndDetect = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const formData = new FormData();
      formData.append("image", blob, "frame.jpg");

      try {
        const res = await fetch(`${AI_SERVICE_URL}/ai/detect-frame`, { method: "POST", body: formData });
        const data = await res.json();
        setLiveDetections(data.detections || []);

        const seenThisFrame = new Set();
        for (const det of data.detections || []) {
          streakRef.current[det.type] = (streakRef.current[det.type] || 0) + 1;
          bestConfRef.current[det.type] = Math.max(bestConfRef.current[det.type] || 0, det.confidence);
          seenThisFrame.add(det.type);

          if (streakRef.current[det.type] === CONSECUTIVE_FRAMES_REQUIRED) {
            const confirmedConfidence = bestConfRef.current[det.type];
            setVerifiedEvents((prev) => [
              { type: det.type, confidence: confirmedConfidence, time: new Date().toLocaleTimeString() },
              ...prev,
            ].slice(0, 5));
            createIncidentFromDetection(det.type, confirmedConfidence);
          }
        }
        Object.keys(streakRef.current).forEach((cls) => {
          if (!seenThisFrame.has(cls)) {
            streakRef.current[cls] = 0;
            bestConfRef.current[cls] = 0;
          }
        });
      } catch (err) {
        console.error("Frame detection failed", err);
      }
    }, "image/jpeg", 0.8);
  }, []);

  useEffect(() => {
    if (!streaming) return;
    const interval = setInterval(captureAndDetect, CAPTURE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [streaming, captureAndDetect]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div style={{ minHeight: "100vh", padding: "1.5rem 2rem" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Live Camera</h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
          Verified detections are created as real incidents and appear on the Dashboard automatically.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <p role="status" style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>{locationStatus}</p>
          <button className="btn" type="button" onClick={requestDeviceLocation} style={{ padding: "4px 8px", fontSize: 11 }}>Retry GPS</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 8 }}>
          <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "#000", minHeight: 360 }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", display: "block" }} />
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {!streaming && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <button className="btn btn-primary" onClick={startCamera} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Camera size={16} /> Start camera
                </button>
              </div>
            )}

            {streaming && (
              <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <AnimatePresence>
                  {liveDetections.map((det) => (
                    <motion.span
                      key={det.type}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      style={{
                        background: "rgba(10,12,16,0.85)", border: "1px solid var(--ember)",
                        color: "var(--ember)", fontSize: 12, padding: "4px 10px", borderRadius: 6,
                        backdropFilter: "blur(4px)",
                      }}
                    >
                      {det.type} · {det.confidence}%
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {streaming && (
            <button className="btn" onClick={stopCamera} style={{ marginTop: 10 }}>Stop camera</button>
          )}
          {error && <p style={{ color: "var(--ember)", fontSize: 13 }}>{error}</p>}
        </div>

        <div className="card">
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px", letterSpacing: "0.03em" }}>
            VERIFIED EVENTS ({CONSECUTIVE_FRAMES_REQUIRED}+ consecutive frames) &rarr; INCIDENT CREATED
          </p>
          {verifiedEvents.length === 0 && (
            <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
              Point the camera at something and hold steady — verified detections appear here AND on the Dashboard.
            </p>
          )}
          <AnimatePresence>
            {verifiedEvents.map((event, i) => (
              <motion.div
                key={event.time + event.type}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}
              >
                <p style={{ fontSize: 14, margin: 0, fontWeight: 500, color: "var(--ember)" }}>
                  {event.type.toUpperCase()} VERIFIED
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
                  {event.confidence}% confidence · {event.time} · sent to Dashboard
                </p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
