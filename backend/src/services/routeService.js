/**
 * Route Service (Section 12 & 13)
 *
 * Shared coordinate route adapter for dashboard paths and dispatch ETAs.
 * OSRM supplies mapped-road geometry when available; the local graph remains
 * the deterministic fallback and supports the blocked-edge demo scenario.
 */
const { nodes, edges } = require("../data/roadNetwork");
const { dijkstra, aStar } = require("../utils/pathfinding");
const { haversineKm, estimateEtaMinutes, isValidCoordinate } = require("../utils/geo");
const axios = require("axios");

const MAX_NETWORK_SNAP_KM = 3;
const ROUTE_CACHE_TTL_MS = 60_000;
const ROUTE_CACHE_MAX_ENTRIES = 500;
const routeCache = new Map();
const inFlightRoutes = new Map();

function computeRoute(startId, goalId, algorithm = "astar") {
  if (!nodes[startId] || !nodes[goalId]) {
    throw new Error(`Unknown node id. Valid node ids: ${Object.keys(nodes).join(", ")}`);
  }

  const result = algorithm === "dijkstra"
    ? dijkstra(nodes, edges, startId, goalId)
    : aStar(nodes, edges, startId, goalId);

  if (!result) {
    return { found: false, message: "No route available — all paths may be blocked" };
  }

  const pathLabels = result.path.map((id) => ({ id, label: nodes[id].label }));
  let totalDistanceKm = 0;
  for (let i = 1; i < result.path.length; i++) {
    const edge = edges.find((candidate) =>
      (candidate.from === result.path[i - 1] && candidate.to === result.path[i]) ||
      (candidate.to === result.path[i - 1] && candidate.from === result.path[i])
    );
    if (edge) totalDistanceKm += edge.distance_km;
  }
  return {
    found: true,
    algorithm,
    route_method: "simulated_road_network",
    path: pathLabels,
    route_coordinates: result.path.map((id) => [nodes[id].lat, nodes[id].lng]),
    estimated_time_min: Number(result.totalTimeMin.toFixed(2)),
    distance_km: Number(totalDistanceKm.toFixed(2)),
    nodes_explored: result.nodesExplored,
  };
}

function nearestNode(latitude, longitude) {
  return Object.entries(nodes)
    .map(([id, node]) => ({
      id,
      distance_km: haversineKm(latitude, longitude, node.lat, node.lng),
    }))
    .sort((a, b) => a.distance_km - b.distance_km)[0];
}

/** Existing deterministic route estimate, retained for simulations and outages. */
function estimateSimulatedRouteBetweenCoordinates(start, goal, algorithm = "astar") {
  if (!start || !goal ||
      !isValidCoordinate(start.latitude, start.longitude) ||
      !isValidCoordinate(goal.latitude, goal.longitude)) {
    return { found: false, route_method: "invalid_coordinates" };
  }

  const straightLineKm = haversineKm(
    Number(start.latitude), Number(start.longitude),
    Number(goal.latitude), Number(goal.longitude)
  );
  const startSnap = nearestNode(Number(start.latitude), Number(start.longitude));
  const goalSnap = nearestNode(Number(goal.latitude), Number(goal.longitude));

  if (startSnap.distance_km > MAX_NETWORK_SNAP_KM || goalSnap.distance_km > MAX_NETWORK_SNAP_KM) {
    return {
      found: true,
      distance_km: Number(straightLineKm.toFixed(2)),
      estimated_time_min: Number(estimateEtaMinutes(straightLineKm).toFixed(2)),
      route_method: "straight_line_fallback",
      route_nodes: [],
      route_coordinates: [
        [Number(start.latitude), Number(start.longitude)],
        [Number(goal.latitude), Number(goal.longitude)],
      ],
    };
  }

  const route = computeRoute(startSnap.id, goalSnap.id, algorithm);
  if (!route.found) return { found: false, route_method: "simulated_road_network" };

  const connectorDistanceKm = startSnap.distance_km + goalSnap.distance_km;
  const connectorTimeMin = estimateEtaMinutes(connectorDistanceKm);
  return {
    found: true,
    distance_km: Number((route.distance_km + connectorDistanceKm).toFixed(2)),
    estimated_time_min: Number((route.estimated_time_min + connectorTimeMin).toFixed(2)),
    route_method: "simulated_road_network",
    route_nodes: route.path.map((node) => node.id),
    route_coordinates: [
      [Number(start.latitude), Number(start.longitude)],
      ...route.path.map((node) => [nodes[node.id].lat, nodes[node.id].lng]),
      [Number(goal.latitude), Number(goal.longitude)],
    ],
    snapped_start_node: startSnap.id,
    snapped_goal_node: goalSnap.id,
  };
}

function coordinateKey(point) {
  return `${Number(point.latitude).toFixed(5)},${Number(point.longitude).toFixed(5)}`;
}

function getCachedRoute(key) {
  const cached = routeCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.savedAt > ROUTE_CACHE_TTL_MS) {
    routeCache.delete(key);
    return null;
  }
  return cached.result;
}

function rememberRoute(key, result) {
  if (routeCache.size >= ROUTE_CACHE_MAX_ENTRIES) {
    const oldestKey = routeCache.keys().next().value;
    if (oldestKey) routeCache.delete(oldestKey);
  }
  routeCache.set(key, { savedAt: Date.now(), result });
}

/**
 * Road route + ETA shared by the map and dispatch optimizer. Uses OSRM's
 * OpenStreetMap road graph when configured; falls back to the local demo graph
 * and then straight-line estimation if the provider is unreachable/no-route.
 */
async function estimateRouteBetweenCoordinates(start, goal, algorithm = "astar") {
  if (!start || !goal ||
      !isValidCoordinate(start.latitude, start.longitude) ||
      !isValidCoordinate(goal.latitude, goal.longitude)) {
    return { found: false, route_method: "invalid_coordinates" };
  }

  const startPoint = { latitude: Number(start.latitude), longitude: Number(start.longitude) };
  const goalPoint = { latitude: Number(goal.latitude), longitude: Number(goal.longitude) };
  const cacheKey = `${coordinateKey(startPoint)}>${coordinateKey(goalPoint)}`;
  const cached = getCachedRoute(cacheKey);
  if (cached) return cached;
  if (inFlightRoutes.has(cacheKey)) return inFlightRoutes.get(cacheKey);

  const routePromise = (async () => {
    const provider = (process.env.ROUTING_PROVIDER || "osrm").toLowerCase();
    const baseUrl = (process.env.OSRM_BASE_URL || "https://router.project-osrm.org").replace(/\/$/, "");
    if (provider === "osrm") {
      try {
        const url = `${baseUrl}/route/v1/driving/${startPoint.longitude},${startPoint.latitude};${goalPoint.longitude},${goalPoint.latitude}`;
        const response = await axios.get(url, {
          params: { overview: "full", geometries: "geojson", steps: false },
          timeout: Number(process.env.OSRM_TIMEOUT_MS) || 2500,
          maxContentLength: 2 * 1024 * 1024,
        });
        const route = response.data?.routes?.[0];
        const coordinates = route?.geometry?.coordinates;
        if (response.data?.code === "Ok" && Array.isArray(coordinates) && coordinates.length >= 2) {
          const result = {
            found: true,
            route_method: "openstreetmap_road_route",
            provider: "OSRM",
            live_traffic: false,
            distance_km: Number((route.distance / 1000).toFixed(2)),
            estimated_time_min: Number((route.duration / 60).toFixed(2)),
            route_coordinates: coordinates.map(([longitude, latitude]) => [latitude, longitude]),
          };
          rememberRoute(cacheKey, result);
          return result;
        }
      } catch (error) {
        // A provider timeout or outage should not break dispatch or map loading.
        console.warn(`OSRM route unavailable; using local fallback (${error.code || error.message})`);
      }
    }

    const fallback = estimateSimulatedRouteBetweenCoordinates(startPoint, goalPoint, algorithm);
    if (fallback.found) {
      fallback.fallback_reason = provider === "osrm" ? "routing_provider_unavailable" : "provider_disabled";
      rememberRoute(cacheKey, fallback);
    }
    return fallback;
  })().finally(() => inFlightRoutes.delete(cacheKey));

  inFlightRoutes.set(cacheKey, routePromise);
  return routePromise;
}

/**
 * Simulates Section 13 (Dynamic Rerouting): given a route already in
 * progress, block one of its edges (representing a newly-discovered
 * obstruction) and recompute. Returns both the original and new route so
 * the improvement/necessity of rerouting is explainable.
 */
function simulateReroute(startId, goalId, blockedEdge, algorithm = "astar") {
  const original = computeRoute(startId, goalId, algorithm);

  const edge = edges.find(
    (e) => (e.from === blockedEdge.from && e.to === blockedEdge.to) ||
           (e.from === blockedEdge.to && e.to === blockedEdge.from)
  );
  if (!edge) {
    throw new Error("Specified edge not found in road network");
  }

  edge.blocked = true;
  const rerouted = computeRoute(startId, goalId, algorithm);
  edge.blocked = false; // restore for next request

  return {
    original_route: original,
    blocked_edge: blockedEdge,
    new_route: rerouted,
    recommendation: rerouted.found
      ? "REROUTE — original path affected by new obstruction"
      : "NO ALTERNATIVE ROUTE AVAILABLE",
  };
}

module.exports = {
  computeRoute,
  estimateRouteBetweenCoordinates,
  estimateSimulatedRouteBetweenCoordinates,
  simulateReroute,
  nodes,
  edges,
};
