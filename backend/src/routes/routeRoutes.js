const express = require("express");
const { authenticate } = require("../middleware/auth");
const { computeRoute, estimateRouteBetweenCoordinates, simulateReroute, nodes } = require("../services/routeService");

const router = express.Router();

// GET /api/optimization/route/nodes — list demo road-network nodes (for testing)
router.get("/route/nodes", authenticate, (req, res) => {
  res.json(nodes);
});

/**
 * POST /api/optimization/route
 * Body: { start: "N4", goal: "N1", algorithm } or
 *       { start: { latitude, longitude }, goal: { latitude, longitude }, algorithm }
 * Coordinate requests return mapped-road geometry and an estimated duration
 * through the shared route adapter. The configured OSRM profile does not use
 * live traffic; local route fallbacks are disclosed in route_method.
 */
router.post("/route", authenticate, async (req, res) => {
  const { start, goal, algorithm } = req.body;
  if (!start || !goal) {
    return res.status(400).json({ error: "start and goal are required" });
  }
  try {
    const result = typeof start === "string" && typeof goal === "string"
      ? computeRoute(start, goal, algorithm || "astar")
      : await estimateRouteBetweenCoordinates(start, goal, algorithm || "astar");
    if (!result.found && result.route_method === "invalid_coordinates") {
      return res.status(400).json({ error: "start/goal must have valid latitude and longitude coordinates" });
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/optimization/route/reroute
 * Body: { start, goal, blocked_edge: { from, to }, algorithm }
 * Simulates a road becoming blocked mid-journey (Section 13) and returns
 * whether a reroute is recommended.
 */
router.post("/route/reroute", authenticate, (req, res) => {
  const { start, goal, blocked_edge, algorithm } = req.body;
  if (!start || !goal || !blocked_edge) {
    return res.status(400).json({ error: "start, goal, and blocked_edge are required" });
  }
  try {
    const result = simulateReroute(start, goal, blocked_edge, algorithm || "astar");
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
