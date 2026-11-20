import { motion } from "framer-motion";

/** Reusable animated wordmark — used on the login page and dashboard header. */
export default function Logo({ size = "large" }) {
  const fontSize = size === "large" ? 42 : 22;
  const letters = "SENTINEL".split("");

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <p style={{ fontSize, fontWeight: 500, margin: 0, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
        {letters.map((letter, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.4 }}
            style={{ position: "relative", display: "inline-block" }}
          >
            {letter}
            {letter === "I" && i === 4 && (
              <span
                style={{
                  position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)",
                  width: 6, height: 6, borderRadius: "50%", background: "var(--ember)",
                  animation: "pulseRing 1.8s ease-out infinite",
                }}
              />
            )}
          </motion.span>
        ))}
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          style={{ color: "var(--signal)", marginLeft: 10 }}
        >
          AI
        </motion.span>
      </p>
      {size === "large" && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          style={{ fontSize: 11, letterSpacing: "0.25em", color: "var(--text-muted)", margin: "8px 0 0" }}
        >
          DETECT · RESPOND · PROTECT
        </motion.p>
      )}
    </div>
  );
}
