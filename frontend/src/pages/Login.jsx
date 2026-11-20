import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError("Invalid email or password");
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: "2.5rem",
    }}>
      <Logo size="large" />
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "-1.5rem 0 0", textAlign: "center", maxWidth: 320, lineHeight: 1.5 }}>
        An Intelligent Emergency Detection, Risk Prediction and Response Optimization Platform
      </p>

      <form onSubmit={handleSubmit} className="card" style={{ width: 320, display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          className="input" type="email" placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)} required
        />
        <input
          className="input" type="password" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)} required
        />
        {error && <p style={{ color: "var(--ember)", fontSize: 13, margin: 0 }}>{error}</p>}
        <button type="submit" className="btn btn-primary" style={{ marginTop: 4 }}>
          Sign in
        </button>
      </form>
    </div>
  );
}
