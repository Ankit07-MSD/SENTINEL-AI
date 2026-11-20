/** Small reusable loading indicator, consistent across all pages. */
export default function Spinner({ label = "Loading..." }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2rem 0", justifyContent: "center" }}>
      <div
        style={{
          width: 16, height: 16, borderRadius: "50%",
          border: "2px solid var(--border-strong)", borderTopColor: "var(--signal)",
          animation: "spin 0.7s linear infinite",
        }}
      />
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{label}</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
