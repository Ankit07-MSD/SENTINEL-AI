import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Flame, Truck, Activity, LogOut, Sparkles, Check, Camera, X } from "lucide-react";
import api from "../services/api";
import socket from "../services/socket";
import { playPriorityAlert, speakIncidentAlert } from "../utils/alertSound";
import Logo from "../components/Logo";
import IncidentMap from "../components/IncidentMap";
import Spinner from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";

const PRIORITY_COLOR = {
  CRITICAL: "#ff7a45",
  HIGH: "#f0a94e",
  MEDIUM: "#e8d24e",
  LOW: "#2dd4bf",
};

export default function Dashboard() {
  const [incidents, setIncidents] = useState([]);
  const [resources, setResources] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [medicalSupportIncidentIds, setMedicalSupportIncidentIds] = useState([]);
  const [optimizationNotice, setOptimizationNotice] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [resolvingIncidentId, setResolvingIncidentId] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [liveEvent, setLiveEvent] = useState(null);
  const [priorityAlert, setPriorityAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const { user, logout } = useAuth();

  useEffect(() => {
    loadData();

    // real-time: whenever the backend emits one of these, refresh silently
    // and flash a small "live" notice so the update is noticeable
    const handleUpdate = (label) => (payload) => {
      setLiveEvent(label);
      loadData();
      setTimeout(() => setLiveEvent(null), 2500);
    };
    socket.on("incident:new", (incident) => {
      const priority = incident?.priority;
      const isUrgent = priority === "HIGH" || priority === "CRITICAL";
      handleUpdate(isUrgent
        ? `${priority} priority incident · ${incident.type}`
        : "New incident detected")(incident);
      if (isUrgent) {
        setPriorityAlert(incident);
        playPriorityAlert(priority);
        window.setTimeout(() => speakIncidentAlert(incident.type, priority), 400);
      }
    });
    socket.on("incident:statusChanged", handleUpdate("Incident status updated"));
    socket.on("resource:statusChanged", handleUpdate("Resource status updated"));
    socket.on("resource:locationChanged", handleUpdate("Resource location updated"));
    socket.on("resource:deleted", handleUpdate("Resource removed"));
    socket.on("dispatch:created", handleUpdate("Resource dispatched"));

    return () => {
      socket.off("incident:new");
      socket.off("incident:statusChanged");
      socket.off("resource:statusChanged");
      socket.off("resource:locationChanged");
      socket.off("resource:deleted");
      socket.off("dispatch:created");
    };
  }, []);

  async function loadData() {
    try {
      const [incidentsRes, resourcesRes] = await Promise.all([
        api.get("/incidents"),
        api.get("/resources"),
      ]);
      setIncidents(incidentsRes.data);
      setResources(resourcesRes.data);
      setLoadError("");
    } catch (err) {
      console.error("Failed to load dashboard data", err);
      setLoadError("Couldn't reach the backend. Check that it's running, then refresh.");
    } finally {
      setLoading(false);
    }
  }

  async function runOptimization() {
    setOptimizing(true);
    setActionError("");
    setActionNotice("");
    try {
      const additionalResourceRequests = medicalSupportIncidentIds.map((incident_id) => ({
        incident_id,
        resource_type: "ambulance",
      }));
      const res = await api.post("/optimization/assign", { additional_resource_requests: additionalResourceRequests });
      setRecommendations(res.data.optimized || []);
      setMedicalSupportIncidentIds([]);
      const excluded = res.data.excluded_resources || [];
      const unfilled = res.data.unassignedDemands || [];
      const notices = [];
      if (excluded.length) {
        notices.push(`Excluded resources with invalid GPS coordinates: ${excluded.map((resource) => resource.code || resource.id).join(", ")}.`);
      }
      if (unfilled.length) {
        notices.push(`No compatible available unit for: ${unfilled.map((demand) => `${demand.required_resource_type} (${demand.assignment_role}, ${demand.incident_type})`).join("; ")}.`);
      }
      setOptimizationNotice(notices.join(" "));
      if (!res.data.optimized?.length) {
        setActionNotice(res.data.message || "No compatible available resource could be recommended for the verified incidents.");
      }
    } catch (err) {
      console.error("Optimization failed", err);
      setActionError(err.response?.data?.error || "Could not calculate resource recommendations.");
    } finally {
      setOptimizing(false);
    }
  }

  async function approveDispatch(rec) {
    setActionError("");
    setActionNotice("");
    try {
      await api.post("/optimization/commit", {
        incident_id: rec.incident_id,
        resource_id: rec.resource_id,
        assignment_score: rec.assignment_score,
        explanation: rec.explanation,
      });
      setRecommendations((prev) => prev.filter((r) => r.incident_id !== rec.incident_id));
      await loadData();
      setActionNotice(`${rec.resource_code} allocated to ${rec.incident_type}; its status is now DISPATCHED.`);
    } catch (err) {
      console.error("Dispatch approval failed", err);
      setActionError(err.response?.data?.error || "Could not approve this resource assignment.");
    }
  }

  async function resolveIncident(incidentId) {
    setResolvingIncidentId(incidentId);
    setActionError("");
    setActionNotice("");
    try {
      await api.patch(`/incidents/${incidentId}/status`, { status: "RESOLVED" });
      await loadData(); // the API also returns any assigned resource to AVAILABLE
      setActionNotice("Incident marked RESOLVED. Any assigned resource has been returned to the available pool.");
    } catch (err) {
      console.error("Failed to resolve incident", err);
      setActionError(err.response?.data?.error || "Could not resolve this incident.");
    } finally {
      setResolvingIncidentId(null);
    }
  }

  // "Active" means not yet resolved/false-alarm — resolved incidents stay in
  // the DB for history/analytics but shouldn't inflate the live counters.
  const activeIncidents = incidents.filter((i) => i.status !== "RESOLVED" && i.status !== "FALSE_ALARM");
  const criticalCount = activeIncidents.filter((i) => i.priority === "CRITICAL").length;
  const locatedResources = resources.filter((r) => r.location_valid !== false &&
    Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)) &&
    Math.abs(Number(r.latitude)) <= 90 && Math.abs(Number(r.longitude)) <= 180
  );
  const availableAmbulances = locatedResources.filter((r) => r.type === "ambulance" && r.status === "AVAILABLE").length;
  const totalAmbulances = locatedResources.filter((r) => r.type === "ambulance").length;
  const availableFireTrucks = locatedResources.filter((r) => r.type === "fire_truck" && r.status === "AVAILABLE").length;
  const totalFireTrucks = locatedResources.filter((r) => r.type === "fire_truck").length;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", padding: "1.5rem 2rem" }}>
        <Spinner label="Loading dashboard..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", padding: "1.5rem 2rem" }}>
        <div className="card" style={{ borderColor: "var(--ember)" }}>
          <p style={{ fontSize: 14, color: "var(--ember)", margin: 0 }}>{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", padding: "1.5rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <AnimatePresence>
          {liveEvent && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--resolved)" }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--resolved)", animation: "dotPulse 1.2s ease-in-out infinite" }} />
              LIVE · {liveEvent}
            </motion.div>
          )}
        </AnimatePresence>
        <div />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{user?.name}</span>
          <button className="btn" onClick={logout} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>

      <AnimatePresence>
        {priorityAlert && (
          <motion.div
            role="alert"
            aria-live="assertive"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
              marginBottom: 14, borderRadius: 8,
              border: `1px solid ${priorityAlert.priority === "CRITICAL" ? "var(--ember)" : "var(--signal)"}`,
              background: priorityAlert.priority === "CRITICAL" ? "rgba(255,122,69,0.14)" : "rgba(240,169,78,0.12)",
            }}
          >
            <AlertTriangle size={18} color={priorityAlert.priority === "CRITICAL" ? "var(--ember)" : "var(--signal)"} />
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 13, color: priorityAlert.priority === "CRITICAL" ? "var(--ember)" : "var(--signal)" }}>
                {priorityAlert.priority} PRIORITY · {priorityAlert.type} INCIDENT
              </strong>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "3px 0 0" }}>
                {priorityAlert.severity_score != null ? `Severity ${priorityAlert.severity_score} · ` : ""}
                {priorityAlert.risk_score != null ? `Risk ${priorityAlert.risk_score} · ` : ""}
                Review the incident and allocate a resource if required.
              </p>
            </div>
            <button className="btn" type="button" aria-label="Dismiss incident alert" onClick={() => setPriorityAlert(null)} style={{ padding: 6 }}>
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <StatCard label="Active incidents" value={activeIncidents.length} icon={<Activity size={18} />} />
        <StatCard label="Critical" value={criticalCount} accent="ember" icon={<AlertTriangle size={18} />} />
        <StatCard label="Ambulances free" value={`${availableAmbulances} / ${totalAmbulances}`} icon={<Truck size={18} />} />
        <StatCard label="Fire trucks free" value={`${availableFireTrucks} / ${totalFireTrucks}`} icon={<Flame size={18} />} />
      </div>

      {actionNotice && <p role="status" style={{ color: "var(--resolved)", fontSize: 12, margin: "0 0 12px" }}>{actionNotice}</p>}
      {actionError && <p role="alert" style={{ color: "var(--ember)", fontSize: 12, margin: "0 0 12px" }}>{actionError}</p>}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={runOptimization} disabled={optimizing} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Sparkles size={14} /> {optimizing ? "Optimizing..." : "Run optimization"}
        </button>
      </div>
      {optimizationNotice && <p role="status" style={{ color: "var(--ember)", fontSize: 12, textAlign: "right", margin: "-4px 0 12px" }}>{optimizationNotice}</p>}

      {recommendations.length > 0 && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="card" style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px", letterSpacing: "0.03em" }}>
            RECOMMENDED DISPATCH &mdash; AWAITING APPROVAL
          </p>
          {recommendations.map((rec) => (
            <div key={`${rec.incident_id}-${rec.required_resource_type}-${rec.resource_id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <p style={{ fontSize: 14, margin: 0, fontWeight: 500 }}>
                  {rec.incident_type} · {rec.assignment_role} <span style={{ color: "var(--text-muted)" }}>&rarr;</span> {rec.resource_code} ({rec.required_resource_type})
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
                  {rec.explanation.join(" · ")}
                </p>
              </div>
              <button className="btn" onClick={() => approveDispatch(rec)} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--resolved)", borderColor: "var(--resolved)" }}>
                <Check size={14} /> Approve
              </button>
            </div>
          ))}
        </motion.div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 12 }}>
        <div className="card">
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px", letterSpacing: "0.03em" }}>
            LIVE INCIDENTS
          </p>
          {activeIncidents.length === 0 && (
            <p style={{ fontSize: 14, color: "var(--text-muted)" }}>No active incidents right now.</p>
          )}
          {activeIncidents.map((incident, i) => {
            const assignedResources = resources.filter((resource) => String(resource.current_incident) === String(incident.id));
            const hasAmbulance = assignedResources.some((resource) => resource.type === "ambulance");
            const medicalSupportRequested = medicalSupportIncidentIds.includes(incident.id);
            return <motion.div
              key={incident.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="incident-row"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 6px", borderBottom: "1px solid var(--border)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: PRIORITY_COLOR[incident.priority] || "#5f6a80",
                    animation: incident.priority === "CRITICAL" ? "dotPulse 1.4s ease-in-out infinite" : "none",
                  }}
                />
                <div>
                  <p style={{ fontSize: 14, margin: 0, fontWeight: 500 }}>
                    {incident.type} &mdash; {incident.status}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
                    {incident.priority} · confidence {incident.detection_confidence}%
                  </p>
                  <p style={{ fontSize: 11, color: assignedResources.length ? "var(--signal)" : "var(--text-muted)", margin: "3px 0 0" }}>
                    {assignedResources.length
                      ? `Allocated: ${assignedResources.map((resource) => `${resource.code} (${resource.type})`).join(", ")}`
                      : incident.status === "VERIFIED"
                        ? "Awaiting allocation · run optimization and approve a recommendation"
                        : "No resource allocated"}
                  </p>
                  {incident.type === "fire" && !hasAmbulance && incident.status !== "RESOLVED" && incident.status !== "FALSE_ALARM" && (
                    <button
                      className="btn"
                      type="button"
                      onClick={() => setMedicalSupportIncidentIds((current) => medicalSupportRequested
                        ? current.filter((id) => id !== incident.id)
                        : [...current, incident.id])}
                      style={{ marginTop: 6, padding: "4px 7px", fontSize: 10, color: medicalSupportRequested ? "var(--signal)" : "var(--text-secondary)" }}
                    >
                      {medicalSupportRequested ? "Cancel ambulance request" : "+ Request ambulance support"}
                    </button>
                  )}
                  {incident.type === "fire" && hasAmbulance && (
                    <p style={{ fontSize: 10, color: "var(--signal)", margin: "4px 0 0" }}>Medical support allocated; status updates remain operator controlled.</p>
                  )}
                </div>
              </div>
              {incident.status !== "RESOLVED" && incident.status !== "FALSE_ALARM" && (
                <button
                  onClick={() => resolveIncident(incident.id)}
                  disabled={resolvingIncidentId === incident.id}
                  title="Mark the incident complete and return all assigned resources to the available pool"
                  style={{
                    fontSize: 11, color: "var(--text-muted)", background: "none",
                    border: "1px solid var(--border-strong)", borderRadius: 6, padding: "4px 8px", cursor: "pointer",
                  }}
                >
                  {resolvingIncidentId === incident.id ? "Resolving…" : "Resolve"}
                </button>
              )}
            </motion.div>;
          })}
        </div>

        <div className="card" style={{ padding: 8 }}>
          <IncidentMap incidents={incidents} resources={resources} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, icon }) {
  return (
    <div className="card stat-card" style={accent === "ember" ? { background: "rgba(74,26,26,0.72)" } : {}}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>{label}</p>
        <span style={{ color: accent === "ember" ? "var(--ember)" : "var(--signal)", opacity: 0.8 }}>{icon}</span>
      </div>
      <p style={{ fontSize: 26, fontWeight: 500, margin: 0, color: accent === "ember" ? "var(--ember)" : "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}
