import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const LETTERS = "SENTINEL".split("");

/**
 * Full-screen animated transition shown between page navigations, built
 * around the wordmark itself rather than a generic spinner. Randomly picks
 * one of a few styles each time so repeated navigation stays fresh.
 * Duration ~1.3s so it reads as a moment, not a flicker.
 */
export default function RouteTransitionOverlay() {
  const location = useLocation();
  const [show, setShow] = useState(false);
  const variantRef = useRef(0);

  useEffect(() => {
    variantRef.current = Math.floor(Math.random() * 3);
    setShow(true);
    const timer = setTimeout(() => setShow(false), 1300);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{
            position: "fixed", inset: 0, zIndex: 999, pointerEvents: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "#0a0c10",
          }}
        >
          {variantRef.current === 0 && <ScanVariant />}
          {variantRef.current === 1 && <ConvergeVariant />}
          {variantRef.current === 2 && <RadarZoomVariant />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Style A: radar rings expand outward from center while the wordmark glows in. */
function RadarZoomVariant() {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {[0, 0.15, 0.3].map((delay, i) => (
        <motion.div
          key={i}
          initial={{ width: 20, height: 20, opacity: 0.8 }}
          animate={{ width: 300, height: 300, opacity: 0 }}
          transition={{ duration: 1.1, delay, ease: "easeOut" }}
          style={{ position: "absolute", borderRadius: "50%", border: "1.5px solid var(--signal)" }}
        />
      ))}
      <motion.p
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
        style={{ fontSize: 34, fontWeight: 500, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
      >
        SENTINEL<span style={{ color: "var(--signal)" }}>AI</span>
      </motion.p>
    </div>
  );
}

/** Style B: letters fly in from alternating left/right and converge into the wordmark. */
function ConvergeVariant() {
  return (
    <p style={{ fontSize: 34, fontWeight: 500, margin: 0, letterSpacing: "-0.01em" }}>
      {LETTERS.map((letter, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, x: i % 2 === 0 ? -60 : 60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: i * 0.045, ease: "backOut" }}
          style={{ display: "inline-block", color: "var(--text-primary)" }}
        >
          {letter}
        </motion.span>
      ))}
      <motion.span
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        style={{ color: "var(--ember)", marginLeft: 10 }}
      >
        AI
      </motion.span>
    </p>
  );
}

/** Style C: a violet scan-line sweeps across, revealing the wordmark underneath. */
function ScanVariant() {
  return (
    <div style={{ position: "relative", overflow: "hidden", padding: "10px 0" }}>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        style={{ fontSize: 34, fontWeight: 500, margin: 0, letterSpacing: "-0.01em", color: "var(--text-primary)" }}
      >
        SENTINEL<span style={{ color: "var(--signal)" }}>AI</span>
      </motion.p>
      <motion.div
        initial={{ left: "-30%" }}
        animate={{ left: "110%" }}
        transition={{ duration: 0.9, delay: 0.15, ease: "easeInOut" }}
        style={{
          position: "absolute", top: 0, bottom: 0, width: "25%",
          background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.9), transparent)",
        }}
      />
    </div>
  );
}
