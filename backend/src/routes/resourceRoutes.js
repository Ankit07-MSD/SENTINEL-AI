const express = require("express");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");
const { isValidCoordinate } = require("../utils/geo");

const router = express.Router();

// GET /api/resources (optional ?status= or ?type= filters)
router.get("/", authenticate, async (req, res) => {
  try {
    const { status, type } = req.query;
    const conditions = [];
    const values = [];
    if (status) { values.push(status); conditions.push(`status = $${values.length}`); }
    if (type) { values.push(type); conditions.push(`type = $${values.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(`SELECT * FROM resources ${where} ORDER BY code`, values);
    res.json(result.rows.map((resource) => ({
      ...resource,
      location_valid: isValidCoordinate(resource.latitude, resource.longitude),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch resources" });
  }
});

// POST /api/resources  (admin adds a new ambulance/fire truck/etc)
router.post("/", authenticate, authorize("admin"), async (req, res) => {
  const { code, type, capability, latitude, longitude, station_name } = req.body;
  if (!isValidCoordinate(latitude, longitude)) {
    return res.status(400).json({ error: "Latitude must be between -90 and 90, and longitude between -180 and 180." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO resources (code, type, capability, latitude, longitude, station_name)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [code, type, capability, latitude, longitude, station_name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create resource" });
  }
});

// PATCH /api/resources/:id/availability — safely take an idle unit offline or
// return an offline/maintenance unit to the available allocation pool.
router.patch("/:id/availability", authenticate, authorize("admin", "operator"), async (req, res) => {
  const { status } = req.body;
  if (!['AVAILABLE', 'OFFLINE'].includes(status)) {
    return res.status(400).json({ error: "status must be AVAILABLE or OFFLINE" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query("SELECT * FROM resources WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!locked.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Resource not found" });
    }
    const current = locked.rows[0];
    const isActive = Boolean(current.current_incident) ||
      ["DISPATCHED", "EN_ROUTE", "ON_SCENE", "RETURNING"].includes(current.status);
    if (isActive && status !== current.status) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "An active resource cannot be disabled or re-enabled. Resolve its incident first." });
    }
    if (status === "AVAILABLE" && !["OFFLINE", "MAINTENANCE", "AVAILABLE"].includes(current.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Only an offline or maintenance resource can be returned to AVAILABLE." });
    }

    const updated = await client.query(
      "UPDATE resources SET status = $1, updated_at = now() WHERE id = $2 RETURNING *",
      [status, req.params.id]
    );
    await client.query("COMMIT");
    req.app.get("io").emit("resource:statusChanged", updated.rows[0]);
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to change resource availability" });
  } finally {
    client.release();
  }
});

// DELETE /api/resources/:id — hard-delete only a never-dispatched record.
// Historical resources must be retained and disabled instead.
router.delete("/:id", authenticate, authorize("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query("SELECT * FROM resources WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!locked.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Resource not found" });
    }

    const resource = locked.rows[0];
    if (resource.current_incident || ["DISPATCHED", "EN_ROUTE", "ON_SCENE", "RETURNING"].includes(resource.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "An active resource cannot be deleted. Resolve its incident first." });
    }

    const history = await client.query(
      `SELECT EXISTS (SELECT 1 FROM dispatches WHERE resource_id = $1)
        OR EXISTS (SELECT 1 FROM routes WHERE resource_id = $1) AS has_history`,
      [req.params.id]
    );
    if (history.rows[0].has_history) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This resource has dispatch history and was kept for records. Disable it instead." });
    }

    await client.query("DELETE FROM resources WHERE id = $1", [req.params.id]);
    await client.query("COMMIT");
    req.app.get("io").emit("resource:deleted", { id: resource.id, code: resource.code });
    res.json({ deleted: true, id: resource.id, code: resource.code });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to delete resource" });
  } finally {
    client.release();
  }
});

// PATCH /api/resources/:id/status
router.patch("/:id/status", authenticate, authorize("admin", "operator"), async (req, res) => {
  const { status, current_incident } = req.body;
  const validStatuses = ["AVAILABLE", "DISPATCHED", "EN_ROUTE", "ON_SCENE", "RETURNING", "MAINTENANCE", "OFFLINE"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${validStatuses.join(", ")}` });
  }

  try {
    // prevent double-assignment: a resource can't go to DISPATCHED/EN_ROUTE for a
    // *different* incident while already tied to one that isn't finished.
    const result = await pool.query(
      `UPDATE resources
       SET status = $1, current_incident = $2, updated_at = now()
       WHERE id = $3 RETURNING *`,
      [status, current_incident || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Resource not found" });

    const resource = result.rows[0];
    req.app.get("io").emit("resource:statusChanged", resource);
    res.json(resource);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update resource status" });
  }
});

// PATCH /api/resources/:id/location  (simulated GPS ping)
router.patch("/:id/location", authenticate, authorize("admin", "operator"), async (req, res) => {
  const { latitude, longitude } = req.body;
  if (!isValidCoordinate(latitude, longitude)) {
    return res.status(400).json({ error: "Latitude must be between -90 and 90, and longitude between -180 and 180." });
  }
  try {
    const result = await pool.query(
      `UPDATE resources SET latitude = $1, longitude = $2, updated_at = now()
       WHERE id = $3 RETURNING *`,
      [latitude, longitude, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Resource not found" });

    const resource = result.rows[0];
    req.app.get("io").emit("resource:locationChanged", resource);
    res.json(resource);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update resource location" });
  }
});

module.exports = router;
