import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { UserPlus, Shield } from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

const ROLE_COLOR = { admin: "var(--ember)", operator: "var(--signal)", viewer: "var(--text-muted)" };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "operator" });
  const [error, setError] = useState("");
  const { user } = useAuth();
  const canManageUsers = user?.role === "admin";

  useEffect(() => { if (canManageUsers) load(); }, [canManageUsers]);

  async function load() {
    try {
      const res = await api.get("/auth/users");
      setUsers(res.data);
    } catch (err) {
      console.error("Failed to load users", err);
      setError(err.response?.data?.error || "Could not load users.");
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/auth/register", form);
      setForm({ name: "", email: "", password: "", role: "operator" });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Could not add user");
    }
  }

  return (
    <div style={{ padding: "1.5rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Users</h1>
        {canManageUsers && (
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <UserPlus size={14} /> Add user
          </button>
        )}
      </div>

      {!canManageUsers ? (
        <div className="card"><p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Admin access is required to view or add users.</p></div>
      ) : (
        <>

      {showForm && (
        <motion.form
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          onSubmit={handleAdd} className="card"
          style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}
        >
          <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className="input" type="password" placeholder="Password (min 6 chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="admin">Admin</option>
            <option value="operator">Operator</option>
            <option value="viewer">Viewer</option>
          </select>
          {error && <p style={{ color: "var(--ember)", fontSize: 13, gridColumn: "span 4", margin: 0 }}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ gridColumn: "span 4" }}>Create user</button>
        </motion.form>
      )}

      <div className="card">
        {users.map((u, i) => (
          <motion.div
            key={u.id}
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
            className="incident-row"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 6px", borderBottom: "1px solid var(--border)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Shield size={16} color={ROLE_COLOR[u.role]} />
              <div>
                <p style={{ fontSize: 14, margin: 0, fontWeight: 500 }}>{u.name}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>{u.email}</p>
              </div>
            </div>
            <span style={{ fontSize: 11, color: ROLE_COLOR[u.role], border: `1px solid ${ROLE_COLOR[u.role]}`, borderRadius: 4, padding: "2px 8px" }}>
              {u.role}
            </span>
          </motion.div>
        ))}
      </div>
        </>
      )}
    </div>
  );
}
