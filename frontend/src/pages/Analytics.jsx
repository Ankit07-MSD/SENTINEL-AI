import { useEffect, useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import api from "../services/api";
import Spinner from "../components/Spinner";

export default function Analytics() {
  const [incidents, setIncidents] = useState([]);
  const [simHistory, setSimHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/incidents"), api.get("/simulation/history")])
      .then(([incidentsRes, simRes]) => {
        setIncidents(incidentsRes.data);
        setSimHistory(simRes.data);
      })
      .catch((err) => console.error("Failed to load analytics", err))
      .finally(() => setLoading(false));
  }, []);

  const typeCounts = {};
  incidents.forEach((i) => { typeCounts[i.type] = (typeCounts[i.type] || 0) + 1; });
  const typeData = Object.entries(typeCounts).map(([name, count]) => ({ name, count }));

  const priorityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  incidents.forEach((i) => { if (priorityCounts[i.priority] !== undefined) priorityCounts[i.priority]++; });
  const priorityData = Object.entries(priorityCounts).map(([name, count]) => ({ name, count }));

  const trendData = [...simHistory].reverse().map((run, i) => ({
    name: `Run ${i + 1}`,
    improvement: Number(run.performance_score),
    response: Number(run.avg_response_time_min),
  }));

  return (
    <div style={{ padding: "1.5rem 2rem" }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 1.5rem" }}>Analytics</h1>
      {loading && <Spinner label="Loading analytics..." />}
      {!loading && (
      <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card">
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px", letterSpacing: "0.03em" }}>
            INCIDENTS BY TYPE
          </p>
          {typeData.length === 0 ? (
            <EmptyNote text="No incidents recorded yet." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }} />
                <Bar dataKey="count" fill="var(--signal)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px", letterSpacing: "0.03em" }}>
            INCIDENTS BY PRIORITY
          </p>
          {incidents.length === 0 ? (
            <EmptyNote text="No incidents recorded yet." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={priorityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }} />
                <Bar dataKey="count" fill="var(--ember)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card">
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px", letterSpacing: "0.03em" }}>
          SIMULATION PERFORMANCE TREND (optimization improvement % over past runs)
        </p>
        {trendData.length === 0 ? (
          <EmptyNote text="Run a few scenarios on the Simulation page to see a trend here." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }} />
              <Line type="monotone" dataKey="improvement" stroke="var(--resolved)" strokeWidth={2} dot={{ r: 3 }} name="Improvement %" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      </>
      )}
    </div>
  );
}

function EmptyNote({ text }) {
  return <p style={{ fontSize: 14, color: "var(--text-muted)", padding: "2rem 0", textAlign: "center" }}>{text}</p>;
}
