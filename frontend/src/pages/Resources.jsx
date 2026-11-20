import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Truck, Ambulance, Shield, LifeBuoy, Power, Trash2 } from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

const TYPE_ICON = { ambulance: Ambulance, fire_truck: Truck, police: Shield, rescue: LifeBuoy };
const STATUS_COLOR = {
  AVAILABLE: "var(--resolved)",
  DISPATCHED: "var(--ember)",
  EN_ROUTE: "var(--ember)",
  ON_SCENE: "var(--signal)",
  MAINTENANCE: "var(--text-muted)",
  OFFLINE: "var(--text-muted)",
};

export default function Resources() {
  const [resources, setResources] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", type: "ambulance", capability: "basic", latitude: "", longitude: "", station_name: "" });
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [locationDraft, setLocationDraft] = useState({ latitude: "", longitude: "" });
  const [locationError, setLocationError] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [formNotice, setFormNotice] = useState("");
  const [resourceActionId, setResourceActionId] = useState(null);
  const [resourceActionError, setResourceActionError] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await api.get("/resources");
    setResources(res.data);
  }

  async function handleAdd(e) {
    e.preventDefault();
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setFormNotice("Enter valid coordinates or use this device's GPS while at the resource station.");
      return;
    }
    try {
      await api.post("/resources", { ...form, latitude, longitude });
      setForm({ code: "", type: "ambulance", capability: "basic", latitude: "", longitude: "", station_name: "" });
      setShowForm(false);
      setFormNotice("");
      await load();
    } catch (err) {
      setFormNotice(err.response?.data?.error || "Could not add the resource.");
    }
  }

  function requestResourceLocation() {
    setFormNotice("");
    if (!window.isSecureContext || !navigator.geolocation) {
      setFormNotice("Device GPS needs HTTPS or localhost. Enter the station coordinates manually.");
      return;
    }
    setFormNotice("Requesting this device's location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setForm((current) => ({
          ...current,
          latitude: String(coords.latitude),
          longitude: String(coords.longitude),
        }));
        setFormNotice(`Coordinates filled from this device (accuracy about ${Math.round(coords.accuracy)} m).`);
      },
      (err) => {
        const reason = err.code === 1 ? "permission denied" : err.code === 3 ? "timed out" : "unavailable";
        setFormNotice(`Device GPS ${reason}. Enter the resource station coordinates manually.`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function toggleAddForm() {
    const opening = !showForm;
    setShowForm(opening);
    setFormNotice("");
    if (opening) requestResourceLocation();
  }

  function beginLocationEdit(resource) {
    setEditingLocationId(resource.id);
    setLocationDraft({ latitude: String(resource.latitude ?? ""), longitude: String(resource.longitude ?? "") });
    setLocationError("");
  }

  async function saveLocation(e, resource) {
    e.preventDefault();
    const latitude = Number(locationDraft.latitude);
    const longitude = Number(locationDraft.longitude);
    if (!locationDraft.latitude.trim() || !locationDraft.longitude.trim() ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setLocationError("Enter a valid latitude (-90 to 90) and longitude (-180 to 180).");
      return;
    }
    setSavingLocation(true);
    setLocationError("");
    try {
      await api.patch(`/resources/${resource.id}/location`, { latitude, longitude });
      setEditingLocationId(null);
      await load();
    } catch (err) {
      setLocationError(err.response?.data?.error || "Could not update resource location.");
    } finally {
      setSavingLocation(false);
    }
  }

  async function changeAvailability(resource, status) {
    setResourceActionId(resource.id);
    setResourceActionError("");
    try {
      await api.patch(`/resources/${resource.id}/availability`, { status });
      await load();
    } catch (err) {
      setResourceActionError(err.response?.data?.error || "Could not change resource availability.");
    } finally {
      setResourceActionId(null);
    }
  }

  async function deleteResource(resource) {
    const confirmed = window.confirm(
      `Delete ${resource.code}? This is allowed only if it has no dispatch or route history. Otherwise, disable it instead.`
    );
    if (!confirmed) return;
    setResourceActionId(resource.id);
    setResourceActionError("");
    try {
      await api.delete(`/resources/${resource.id}`);
      await load();
    } catch (err) {
      setResourceActionError(err.response?.data?.error || "Could not delete this resource.");
    } finally {
      setResourceActionId(null);
    }
  }

  return (
    <div style={{ padding: "1.5rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Resources</h1>
        <button className="btn btn-primary" onClick={toggleAddForm} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={14} /> {showForm ? "Cancel" : "Add resource"}
        </button>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "-12px 0 16px" }}>
        New resource coordinates can be filled from this device's GPS (use this only while at the station); live vehicle GPS tracking is not connected.
      </p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "-10px 0 16px" }}>
        Disable takes a unit out of new allocations. Only admins can delete a resource, and records with dispatch history must be disabled instead.
      </p>
      {resourceActionError && <p role="alert" className="card" style={{ color: "var(--ember)", fontSize: 12, margin: "0 0 12px" }}>{resourceActionError}</p>}

      {showForm && (
        <motion.form
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          onSubmit={handleAdd} className="card"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}
        >
          <input className="input" placeholder="Code (e.g. A03)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="ambulance">Ambulance</option>
            <option value="fire_truck">Fire truck</option>
            <option value="police">Police</option>
            <option value="rescue">Rescue</option>
          </select>
          <input className="input" placeholder="Capability (e.g. ICU, basic)" value={form.capability} onChange={(e) => setForm({ ...form, capability: e.target.value })} />
          <input className="input" type="number" min="-90" max="90" step="any" placeholder="Latitude (-90 to 90)" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} required />
          <input className="input" type="number" min="-180" max="180" step="any" placeholder="Longitude (-180 to 180)" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} required />
          <input className="input" placeholder="Station name" value={form.station_name} onChange={(e) => setForm({ ...form, station_name: e.target.value })} />
          {formNotice && <p role="status" style={{ gridColumn: "span 3", color: "var(--text-secondary)", fontSize: 12, margin: 0 }}>{formNotice}</p>}
          <button type="button" className="btn" onClick={requestResourceLocation} style={{ gridColumn: "span 3" }}>Use this device's GPS</button>
          <button type="submit" className="btn btn-primary" style={{ gridColumn: "span 3" }}>Save resource</button>
        </motion.form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {resources.map((r, i) => {
          const Icon = TYPE_ICON[r.type] || Truck;
          const locationValid = r.location_valid ?? (
            Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)) &&
            Number(r.latitude) >= -90 && Number(r.latitude) <= 90 &&
            Number(r.longitude) >= -180 && Number(r.longitude) <= 180
          );
          const activeResponse = Boolean(r.current_incident) || ["DISPATCHED", "EN_ROUTE", "ON_SCENE", "RETURNING"].includes(r.status);
          const canToggleAvailability = !activeResponse && ["AVAILABLE", "OFFLINE", "MAINTENANCE"].includes(r.status);
          return (
            <motion.div
              key={r.id} className="card"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon size={18} color="var(--signal)" />
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{r.code}</span>
                </div>
                <span style={{ fontSize: 11, color: STATUS_COLOR[r.status], border: `1px solid ${STATUS_COLOR[r.status]}`, borderRadius: 4, padding: "2px 6px" }}>
                  {r.status}
                </span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>
                {r.capability} · {r.station_name || "No station set"}
              </p>
              <p style={{ fontSize: 11, color: locationValid ? "var(--text-muted)" : "var(--ember)", margin: "6px 0 0" }}>
                {locationValid
                  ? `Location ${Number(r.latitude).toFixed(4)}, ${Number(r.longitude).toFixed(4)}`
                  : "Invalid coordinates · excluded from dispatch ETA"}
              </p>
              {editingLocationId === r.id ? (
                <form onSubmit={(e) => saveLocation(e, r)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                  <input className="input" type="number" min="-90" max="90" step="any" aria-label={`${r.code} latitude`} placeholder="Latitude" value={locationDraft.latitude} onChange={(e) => setLocationDraft({ ...locationDraft, latitude: e.target.value })} required />
                  <input className="input" type="number" min="-180" max="180" step="any" aria-label={`${r.code} longitude`} placeholder="Longitude" value={locationDraft.longitude} onChange={(e) => setLocationDraft({ ...locationDraft, longitude: e.target.value })} required />
                  {locationError && <p role="alert" style={{ gridColumn: "span 2", color: "var(--ember)", fontSize: 11, margin: 0 }}>{locationError}</p>}
                  <button className="btn btn-primary" type="submit" disabled={savingLocation} style={{ fontSize: 11 }}>{savingLocation ? "Saving…" : "Save location"}</button>
                  <button className="btn" type="button" disabled={savingLocation} onClick={() => { setEditingLocationId(null); setLocationError(""); }} style={{ fontSize: 11 }}>Cancel</button>
                </form>
              ) : (
                <button className="btn" type="button" onClick={() => beginLocationEdit(r)} style={{ fontSize: 11, marginTop: 8, padding: "4px 8px" }}>Edit coordinates</button>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {canToggleAvailability && (
                  <button
                    className="btn"
                    type="button"
                    disabled={resourceActionId === r.id}
                    onClick={() => changeAvailability(r, r.status === "AVAILABLE" ? "OFFLINE" : "AVAILABLE")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "5px 8px" }}
                  >
                    <Power size={13} />
                    {resourceActionId === r.id ? "Saving…" : r.status === "AVAILABLE" ? "Disable" : "Enable"}
                  </button>
                )}
                {user?.role === "admin" && !activeResponse && (
                  <button
                    className="btn"
                    type="button"
                    disabled={resourceActionId === r.id}
                    onClick={() => deleteResource(r)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "5px 8px", color: "var(--ember)" }}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
                {activeResponse && <span style={{ fontSize: 11, color: "var(--text-muted)", alignSelf: "center" }}>Active incident · resolve before disabling/deleting</span>}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
