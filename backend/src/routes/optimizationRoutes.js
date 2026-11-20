const express = require("express");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");
const {
  optimizeAssignment,
  baselineNearestAssignment,
  buildRouteMatrix,
  averageResponseTime,
  REQUIRED_RESOURCE_TYPE,
} = require("../services/optimizationService");

const router = express.Router();

/**
 * POST /api/optimization/assign
 * Body (optional): { incident_ids: [...] }  -- if omitted, uses all VERIFIED
 * incidents that don't yet have a resource assigned.
 *
 * Returns the Hungarian-Algorithm-optimal assignment PLUS a naive baseline
 * comparison, so the improvement % can be shown (Section 28).
 *
 * NOTE: this only RECOMMENDS assignments. Nothing is dispatched here — an
 * operator must separately call the dispatch/status-update endpoints to
 * actually commit a resource (Section 1, human-in-the-loop requirement).
 */
router.post("/assign", authenticate, authorize("admin", "operator"), async (req, res) => {
  try {
    const requests = Array.isArray(req.body.additional_resource_requests)
      ? req.body.additional_resource_requests
      : [];
    const requestedIncidentIds = [...new Set(requests.map((item) => item?.incident_id).filter(Boolean))];

    const incidentsQuery = requestedIncidentIds.length
      ? { text: "SELECT * FROM incidents WHERE status = 'VERIFIED' OR (id = ANY($1) AND status = 'ASSIGNED') ORDER BY detected_at ASC", values: [requestedIncidentIds] }
      : { text: "SELECT * FROM incidents WHERE status = 'VERIFIED' ORDER BY detected_at ASC", values: [] };

    const incidentsResult = await pool.query(incidentsQuery);
    const resourcesResult = await pool.query("SELECT * FROM resources WHERE status = 'AVAILABLE'");

    const incidents = incidentsResult.rows;
    const resources = resourcesResult.rows;

    if (incidents.length === 0) {
      return res.json({ message: "No verified incidents awaiting assignment", assignments: [] });
    }
    if (resources.length === 0) {
      return res.json({ message: "No available resources right now", assignments: [], unassignedIncidents: incidents.map(i => i.id) });
    }

    const existingResourceResult = requestedIncidentIds.length
      ? await pool.query(
        "SELECT current_incident AS incident_id, type FROM resources WHERE current_incident = ANY($1)",
        [requestedIncidentIds]
      )
      : { rows: [] };
    const assignedTypesByIncident = new Map();
    for (const row of existingResourceResult.rows) {
      const key = String(row.incident_id);
      if (!assignedTypesByIncident.has(key)) assignedTypesByIncident.set(key, new Set());
      assignedTypesByIncident.get(key).add(row.type);
    }

    const demands = [];
    for (const incident of incidents) {
      const alreadyAssigned = assignedTypesByIncident.get(String(incident.id)) || new Set();
      const primaryType = REQUIRED_RESOURCE_TYPE[incident.type] || "ambulance";
      if (!alreadyAssigned.has(primaryType)) {
        demands.push({ ...incident, required_resource_type: primaryType, assignment_role: "Primary response" });
      }
      const requestedForIncident = requests.filter((request) =>
        String(request?.incident_id) === String(incident.id) && request?.resource_type === "ambulance"
      );
      // An extra ambulance is an explicit operator request for a fire incident;
      // we do not infer casualties from a fire label or a person count.
      if (incident.type === "fire" && requestedForIncident.length > 0 && !alreadyAssigned.has("ambulance")) {
        demands.push({
          ...incident,
          required_resource_type: "ambulance",
          assignment_role: "Medical support",
        });
      }
    }

    if (!demands.length) {
      return res.json({ optimized: [], unassignedIncidents: [], message: "Requested resource types are already assigned." });
    }

    // Reuse one shared road ETA matrix for all unit-demand slots and the
    // comparison baseline. Each incident can now need multiple unit types.
    const routeMatrix = await buildRouteMatrix(demands, resources);
    const optimized = await optimizeAssignment(demands, resources, routeMatrix);
    const baseline = await baselineNearestAssignment(demands, resources, routeMatrix);

    const optimizedAvg = averageResponseTime(optimized.assignments);
    const baselineAvg = averageResponseTime(baseline);
    const improvementPct = baselineAvg > 0
      ? Number((((baselineAvg - optimizedAvg) / baselineAvg) * 100).toFixed(1))
      : 0;

    res.json({
      optimized: optimized.assignments,
      unassignedIncidents: [...new Set(optimized.unassignedIncidents)],
      unassignedDemands: optimized.unassignedDemands || [],
      comparison: {
        baseline_avg_response_min: baselineAvg,
        optimized_avg_response_min: optimizedAvg,
        improvement_percent: improvementPct,
      },
      excluded_resources: optimized.excludedResources || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Optimization failed" });
  }
});

/**
 * POST /api/optimization/commit
 * Body: { incident_id, resource_id }
 * Called AFTER a human operator reviews and approves a recommended
 * assignment from /assign. This is the actual dispatch commit step.
 */
router.post("/commit", authenticate, authorize("admin", "operator"), async (req, res) => {
  const { incident_id, resource_id, assignment_score, explanation } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // lock the resource row to prevent a race where two operators commit
    // the same resource to two different incidents at once
    const resourceCheck = await client.query(
      "SELECT * FROM resources WHERE id = $1 FOR UPDATE", [resource_id]
    );
    if (resourceCheck.rows.length === 0 || resourceCheck.rows[0].status !== "AVAILABLE") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Resource is no longer available" });
    }

    await client.query(
      "UPDATE resources SET status = 'DISPATCHED', current_incident = $1, updated_at = now() WHERE id = $2",
      [incident_id, resource_id]
    );
    await client.query(
      "UPDATE incidents SET status = 'ASSIGNED' WHERE id = $1", [incident_id]
    );
    const dispatchResult = await client.query(
      `INSERT INTO dispatches (incident_id, resource_id, assignment_score, explanation, approved_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [incident_id, resource_id, assignment_score || null, JSON.stringify(explanation || []), req.user.id]
    );

    await client.query("COMMIT");

    req.app.get("io").emit("dispatch:created", dispatchResult.rows[0]);
    res.status(201).json(dispatchResult.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to commit dispatch" });
  } finally {
    client.release();
  }
});

module.exports = router;
