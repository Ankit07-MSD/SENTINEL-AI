const express = require("express");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");
const { runScenario } = require("../services/simulationService");

const router = express.Router();

/**
 * POST /api/simulation/run
 * Body: {
 *   scenario_name: "Rush hour multi-incident",
 *   incidents: [{ type, latitude, longitude, priority, severity_score }, ...],
 *   resources: [{ type, capability, latitude, longitude, status: "AVAILABLE" }, ...]
 * }
 * Computes baseline vs optimized on this HYPOTHETICAL scenario (no DB writes
 * to incidents/resources), stores a summary row in simulation_runs, and
 * returns the comparison for the dashboard to chart.
 */
router.post("/run", authenticate, authorize("admin", "operator"), async (req, res) => {
  const { scenario_name, incidents, resources } = req.body;

  if (!Array.isArray(incidents) || !Array.isArray(resources) || incidents.length === 0 || resources.length === 0) {
    return res.status(400).json({ error: "incidents and resources arrays are required and must be non-empty" });
  }

  try {
    const result = await runScenario(incidents, resources);

    await pool.query(
      `INSERT INTO simulation_runs
        (scenario_name, strategy, avg_response_time_min, resource_utilization, performance_score)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        scenario_name || "Untitled scenario",
        "optimized_vs_baseline",
        result.optimized.avg_response_time_min,
        result.resource_utilization_percent,
        result.improvement_percent,
      ]
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Simulation failed" });
  }
});

// GET /api/simulation/history — past simulation runs, for a trend view
router.get("/history", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM simulation_runs ORDER BY created_at DESC LIMIT 20"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch simulation history" });
  }
});

module.exports = router;
