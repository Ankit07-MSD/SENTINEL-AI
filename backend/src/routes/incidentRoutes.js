const express = require("express");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");
const { isValidCoordinate } = require("../utils/geo");

const router = express.Router();

// GET /api/incidents  (list, newest first, optional ?status= filter)
router.get("/", authenticate, async (req, res) => {
  try {
    const { status } = req.query;
    const query = status
      ? { text: "SELECT * FROM incidents WHERE status = $1 ORDER BY detected_at DESC", values: [status] }
      : { text: "SELECT * FROM incidents ORDER BY detected_at DESC LIMIT 200", values: [] };
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch incidents" });
  }
});

// GET /api/incidents/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM incidents WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Incident not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch incident" });
  }
});

// POST /api/incidents  (create — called after AI detection+severity, or manual entry)
router.post("/", authenticate, async (req, res) => {
  const {
    type, latitude, longitude, source, detection_confidence,
    frames_confirmed, verified, severity_score, risk_score,
    priority, explanation, raw_features,
  } = req.body;

  if (!isValidCoordinate(latitude, longitude)) {
    return res.status(400).json({ error: "Latitude must be between -90 and 90, and longitude between -180 and 180." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO incidents
        (type, latitude, longitude, source, detection_confidence, frames_confirmed,
         verified, severity_score, risk_score, priority, status, explanation, raw_features, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        type, latitude, longitude, source || "manual", detection_confidence || null,
        frames_confirmed || 0, verified || false, severity_score || null, risk_score || null,
        priority || null, verified ? "VERIFIED" : "PENDING_VERIFICATION",
        JSON.stringify(explanation || []), JSON.stringify(raw_features || {}), req.user.id,
      ]
    );
    const incident = result.rows[0];

    // notify all connected dashboard clients in real time
    req.app.get("io").emit("incident:new", incident);

    res.status(201).json(incident);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create incident" });
  }
});

// PATCH /api/incidents/:id/status
router.patch("/:id/status", authenticate, authorize("admin", "operator"), async (req, res) => {
  const { status } = req.body;
  const validStatuses = ["PENDING_VERIFICATION", "VERIFIED", "ASSIGNED", "DISPATCHED", "RESOLVED", "FALSE_ALARM"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${validStatuses.join(", ")}` });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const timestampCol = status === "RESOLVED" ? ", resolved_at = now()" : "";
    const result = await client.query(
      `UPDATE incidents SET status = $1 ${timestampCol} WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Incident not found" });
    }

    // Resolving (or marking a false alarm) frees up any resource still tied
    // to this incident, and closes out its dispatch record — otherwise a
    // resource would stay stuck as DISPATCHED forever after the job is done.
    if (status === "RESOLVED" || status === "FALSE_ALARM") {
      await client.query(
        `UPDATE resources SET status = 'AVAILABLE', current_incident = NULL, updated_at = now()
         WHERE current_incident = $1`,
        [req.params.id]
      );
      await client.query(
        `UPDATE dispatches SET completed_at = now()
         WHERE incident_id = $1 AND completed_at IS NULL`,
        [req.params.id]
      );
    }

    await client.query("COMMIT");

    const incident = result.rows[0];
    req.app.get("io").emit("incident:statusChanged", incident);
    req.app.get("io").emit("resource:statusChanged", { incident_id: incident.id }); // nudge dashboards to refresh resources too
    res.json(incident);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to update incident status" });
  } finally {
    client.release();
  }
});

module.exports = router;
