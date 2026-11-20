import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Circle, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import api from "../services/api";
import Spinner from "../components/Spinner";

function riskColor(score) {
  if (score >= 61) return "#ff7a45"; // ember — high/critical
  if (score >= 31) return "#e8d24e"; // yellow — medium
  return "#2dd4bf"; // teal — low
}

export default function RiskHeatmap() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyCount, setHistoryCount] = useState(0);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    api.get("/prediction/heatmap")
      .then((res) => {
        setZones(res.data.zones || []);
        setHistoryCount(res.data.history_count || 0);
        setLoadError("");
      })
      .catch((err) => {
        console.error("Failed to load heatmap", err);
        setLoadError("Could not load saved incident history. Check the backend connection and try again.");
      })
      .finally(() => setLoading(false));
  }, []);

  const center = zones.length > 0 ? [zones[0].latitude, zones[0].longitude] : [28.7041, 77.1025];

  return (
    <div style={{ padding: "1.5rem 2rem" }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 4px" }}>Risk Heatmap</h1>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 1.5rem" }}>
        Historical activity summary from saved, verified incidents within 3 km of five demo zones. This is not a trained model, probability, or forecast of future incidents.
      </p>

      <div className="card" style={{ marginBottom: 12, fontSize: 12, color: "var(--text-secondary)" }}>
        Saved verified incidents used: <strong>{loading ? "…" : historyCount}</strong>. A zone score combines nearby incident count and average recorded severity; it updates when this page is reopened.
      </div>
      {loadError && <div role="alert" className="card" style={{ marginBottom: 12, color: "var(--ember)", fontSize: 12 }}>{loadError}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 8 }}>
          <div className="dark-map-wrapper" style={{ height: 420, borderRadius: 8, overflow: "hidden" }}>
            <style>{`
              .dark-map-wrapper .leaflet-tile-pane {
                filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9) saturate(0.8);
              }
            `}</style>
            <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
              />
              {zones.filter((zone) => zone.historical_incident_count > 0).map((zone) => (
                <Circle
                  key={zone.zone_name}
                  center={[zone.latitude, zone.longitude]}
                  radius={3000}
                  pathOptions={{
                    color: riskColor(zone.risk_score),
                    fillColor: riskColor(zone.risk_score),
                    fillOpacity: 0.25,
                    weight: 1.5,
                  }}
                >
                  <Popup>
                    <strong>{zone.zone_name}</strong><br />
                    Risk score: {zone.risk_score}<br />
                    Historical incidents: {zone.historical_incident_count}<br />
                    {zone.dominant_incident_type && <>Most common: {zone.dominant_incident_type}</>}
                  </Popup>
                </Circle>
              ))}
            </MapContainer>
          </div>
        </div>

        <div className="card">
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px", letterSpacing: "0.03em" }}>
            ZONE BREAKDOWN
          </p>
          {zones.length > 0 && historyCount === 0 && !loading && <p style={{ fontSize: 14, color: "var(--text-muted)" }}>No verified incidents have been saved yet. Zone scores appear after confirmed incidents are recorded.</p>}
          {loadError && !loading && <p style={{ fontSize: 14, color: "var(--text-muted)" }}>Heatmap data is unavailable right now.</p>}
          {loading && <Spinner label="Computing risk..." />}
          {zones
            .filter(() => historyCount > 0)
            .slice()
            .sort((a, b) => b.risk_score - a.risk_score)
            .map((zone) => (
              <div key={zone.zone_name} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{zone.zone_name}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: riskColor(zone.risk_score) }}>
                    Activity {zone.risk_score}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
                  {zone.historical_incident_count} incident{zone.historical_incident_count !== 1 ? "s" : ""}
                  {zone.dominant_incident_type ? ` · mostly ${zone.dominant_incident_type}` : " · no history yet"}
                </p>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
