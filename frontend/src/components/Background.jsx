import { useMemo } from "react";

/**
 * Full-screen animated backdrop: a faint drifting grid, two counter-rotating
 * radar sweeps (violet + ember), concentric rings, a network of connected
 * signal dots that pulse, and a slow-drifting grid — all very low-opacity
 * so it never competes with foreground content. Ties the visual language
 * back to "Sentinel" (a watcher scanning a network for signals).
 */
export default function Background() {
  const dots = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        id: i,
        top: Math.random() * 100,
        left: Math.random() * 100,
        delay: Math.random() * 5,
        size: 2 + Math.random() * 2,
        color: Math.random() > 0.6 ? "var(--ember)" : "var(--signal)",
      })),
    []
  );

  // pick a few dot pairs to connect with faint animated lines, like a sensor network
  const links = useMemo(
    () =>
      Array.from({ length: 7 }, () => {
        const a = dots[Math.floor(Math.random() * dots.length)];
        const b = dots[Math.floor(Math.random() * dots.length)];
        return { x1: a.left, y1: a.top, x2: b.left, y2: b.top, delay: Math.random() * 4 };
      }),
    [dots]
  );

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: -1, overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      {/* slowly drifting grid */}
      <div
        style={{
          position: "absolute", inset: "-10%", opacity: 0.35,
          backgroundImage:
            "linear-gradient(rgba(139,92,246,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.07) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
          animation: "gridDrift 40s linear infinite",
        }}
      />

      {/* primary radar sweep — violet, faster */}
      <div
        style={{
          position: "absolute", top: "50%", left: "50%",
          width: "150vmax", height: "150vmax",
          transform: "translate(-50%, -50%)",
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(139,92,246,0.12) 35deg, transparent 75deg)",
          animation: "radarSpin 9s linear infinite",
          borderRadius: "50%",
        }}
      />
      {/* secondary radar sweep — ember, slower, opposite direction */}
      <div
        style={{
          position: "absolute", top: "50%", left: "50%",
          width: "120vmax", height: "120vmax",
          transform: "translate(-50%, -50%)",
          background:
            "conic-gradient(from 180deg, transparent 0deg, rgba(255,122,69,0.07) 25deg, transparent 60deg)",
          animation: "radarSpinReverse 16s linear infinite",
          borderRadius: "50%",
        }}
      />

      {/* concentric radar rings */}
      {[180, 360, 560, 780].map((size) => (
        <div
          key={size}
          style={{
            position: "absolute", top: "50%", left: "50%", width: size, height: size,
            transform: "translate(-50%, -50%)", borderRadius: "50%",
            border: "1px solid rgba(139,92,246,0.07)",
          }}
        />
      ))}

      {/* faint sensor-network connecting lines */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {links.map((l, i) => (
          <line
            key={i}
            x1={`${l.x1}%`} y1={`${l.y1}%`} x2={`${l.x2}%`} y2={`${l.y2}%`}
            stroke="rgba(139,92,246,0.15)" strokeWidth="1"
            style={{ animation: `linkFade 6s ease-in-out ${l.delay}s infinite` }}
          />
        ))}
      </svg>

      {/* floating signal dots */}
      {dots.map((dot) => (
        <div
          key={dot.id}
          style={{
            position: "absolute", top: `${dot.top}%`, left: `${dot.left}%`,
            width: dot.size, height: dot.size, borderRadius: "50%",
            background: dot.color,
            animation: `signalBlip 3.5s ease-in-out ${dot.delay}s infinite`,
          }}
        />
      ))}

      <style>{`
        @keyframes radarSpin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
        @keyframes radarSpinReverse { from { transform: translate(-50%, -50%) rotate(360deg); } to { transform: translate(-50%, -50%) rotate(0deg); } }
        @keyframes signalBlip { 0%, 100% { opacity: 0.15; transform: scale(1); } 50% { opacity: 0.9; transform: scale(1.8); } }
        @keyframes linkFade { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
        @keyframes gridDrift { from { transform: translate(0, 0); } to { transform: translate(42px, 42px); } }
      `}</style>
    </div>
  );
}
