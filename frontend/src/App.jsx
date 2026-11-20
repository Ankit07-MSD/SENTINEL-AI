import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LiveCamera from "./pages/LiveCamera";
import Resources from "./pages/Resources";
import Simulation from "./pages/Simulation";
import Analytics from "./pages/Analytics";
import Users from "./pages/Users";
import RiskHeatmap from "./pages/RiskHeatmap";
import Background from "./components/Background";
import Sidebar from "./components/Sidebar";
import RouteTransitionOverlay from "./components/RouteTransitionOverlay";
import "./theme.css";

function ProtectedLayout({ children, adminOnly = false }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function AppRoutes() {
  return (
    <>
      <RouteTransitionOverlay />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
        <Route path="/resources" element={<ProtectedLayout><Resources /></ProtectedLayout>} />
        <Route path="/simulation" element={<ProtectedLayout><Simulation /></ProtectedLayout>} />
        <Route path="/analytics" element={<ProtectedLayout><Analytics /></ProtectedLayout>} />
        <Route path="/users" element={<ProtectedLayout adminOnly><Users /></ProtectedLayout>} />
        <Route path="/heatmap" element={<ProtectedLayout><RiskHeatmap /></ProtectedLayout>} />
        <Route path="/live-camera" element={<ProtectedLayout><LiveCamera /></ProtectedLayout>} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Background />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
