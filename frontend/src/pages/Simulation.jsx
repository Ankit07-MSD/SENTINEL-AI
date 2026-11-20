import { useState } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Play } from "lucide-react";
import api from "../services/api";

const CENTER = { lat: 28.7041, lng: 77.1025 };
const INCIDENT_TYPES = ["fire", "accident", "fallen_person", "crowd_anomaly"];
const RESOURCE_TYPES = [
  { type: "ambulance", capability: "basic" },
  { type: "fire_truck", capability: "heavy_rescue" },
];

function jitter(base, spread = 0.03) {
  return base + (Math.random() - 0.5) * spread;
}

export default function Simulation() {
  const [counts, setCounts] = useState({ fire: 1, accident: 1, fallen_person: 1, crowd_anomaly: 0 });
  const [resourceCounts, setResourceCounts] = useState({ ambulance: 2, fire_truck: 1 });
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  async function runSimulation() {
    setRunning(true);
    const incidents = [];
    INCIDENT_TYPES.forEach((type) => {
      for (let i = 0; i < counts[type]; i++) {
        incidents.push({
          type,
          latitude: jitter(CENTER.lat),
          longitude: jitter(CENTER.lng),
          priority: type === "fire" ? "CRITICAL" : type === "accident" ? "HIGH" : "MEDIUM",
          severity_score: type === "fire" ? 85 : 60,
        });
      }
    });

    const resources = [];
    RESOURCE_TYPES.forEach(({ type, capability }) => {
      for (let i = 0; i < resourceCounts[type]; i++) {
        resources.push({
          type, capability, status: "AVAILABLE",
          latitude: jitter(CENTER.lat), longitude: jitter(CENTER.lng),
        });
      }
    });

    try {
      const res = await api.post("/simulation/run", {
        scenario_name: `Scenario ${new Date().toLocaleTimeString()}`,
        incidents, resources,
      });
      setResult(res.data);
    } catch (err) {
      console.error("Simulation failed", err);
    } finally {
      setRunning(false);
    }
  }

  const chartData = result
    ? [
        { name: "Avg response (min)", Baseline: result.baseline.avg_response_time_min, Optimized: result.optimized.avg_response_time_min },
        { name: "Total distance (km)", Baseline: result.baseline.total_distance_km, Optimized: result.optimized.total_distance_km },
      ]
    : [];

  return (
    <div style={{ padding: "1.5rem 2rem" }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 4px" }}>Crisis Simulation</h1>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 1.5rem" }}>
        Uses generated demo locations and simulated road traffic. Estimates are for comparing strategies, not live arrival predictions.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16 }}>
        <div className="card">
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px", letterSpacing: "0.03em" }}>SCENARIO</p>

          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 6px" }}>Incidents</p>
          {INCIDENT_TYPES.map((type) => (
            <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>{type}</span>
              <input
                type="number" min="0" max="6" className="input" style={{ width: 60 }}
                value={counts[type]} onChange={(e) => setCounts({ ...counts, [type]: Number(e.target.value) })}
              />
            </div>
          ))}

          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "14px 0 6px" }}>Available resources</p>
          {RESOURCE_TYPES.map(({ type }) => (
            <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>{type}</span>
              <input
                type="number" min="0" max="8" className="input" style={{ width: 60 }}
                value={resourceCounts[type]} onChange={(e) => setResourceCounts({ ...resourceCounts, [type]: Number(e.target.value) })}
              />
            </div>
          ))}

          <button className="btn btn-primary" onClick={runSimulation} disabled={running} style={{ width: "100%", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Play size={14} /> {running ? "Running..." : "Run simulation"}
          </button>
        </div>

        <div className="card">
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px", letterSpacing: "0.03em" }}>
            BASELINE (NEAREST) VS OPTIMIZED (HUNGARIAN)
          </p>

          {!result && <p style={{ fontSize: 14, color: "var(--text-muted)" }}>Set a scenario and run it to see the comparison.</p>}

          {result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Baseline" fill="#5f6a80" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Optimized" fill="var(--signal)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 12 }}>
                <MiniStat label="Improvement" value={`${result.improvement_percent}%`} accent />
                <MiniStat label="Resource utilization" value={`${result.resource_utilization_percent}%`} />
                <MiniStat label="Unassigned" value={result.unassigned_incidents} />
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent }) {
  return (
    <div style={{ background: "var(--bg-surface-2)", borderRadius: 8, padding: "8px 10px" }}>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 500, margin: "2px 0 0", color: accent ? "var(--resolved)" : "var(--text-primary)" }}>{value}</p>
    </div>
  );
}
