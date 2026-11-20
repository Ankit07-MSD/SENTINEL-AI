/**
 * Pathfinding (Section 12): Dijkstra's Algorithm and A* Search.
 *
 * Both operate on a graph of { nodeId: { lat, lng } } nodes and a list of
 * { from, to, distance_km, traffic_factor, blocked } edges. The "cost" of an
 * edge is travel TIME (distance * traffic_factor), not raw distance — this
 * is what lets the engine prefer a longer-but-faster road over a
 * shorter-but-congested one, per the spec's Route A/Route B example.
 *
 * Dijkstra: explores purely by accumulated cost so far — guaranteed optimal,
 * explores more nodes than necessary.
 * A*: adds a heuristic (straight-line distance to the goal, converted to an
 * optimistic time estimate) to guide the search toward the goal faster.
 * Still guaranteed optimal because the heuristic never overestimates.
 */
const { haversineKm, estimateEtaMinutes, DEFAULT_EMERGENCY_SPEED_KMH } = require("../utils/geo");

function buildAdjacency(edges) {
  const adjacency = {};
  for (const edge of edges) {
    if (edge.blocked) continue; // blocked roads are simply not traversable
    const timeCost = estimateEtaMinutes(edge.distance_km, DEFAULT_EMERGENCY_SPEED_KMH) * edge.traffic_factor;
    if (!adjacency[edge.from]) adjacency[edge.from] = [];
    if (!adjacency[edge.to]) adjacency[edge.to] = [];
    adjacency[edge.from].push({ to: edge.to, cost: timeCost, distance_km: edge.distance_km, traffic_factor: edge.traffic_factor });
    adjacency[edge.to].push({ to: edge.from, cost: timeCost, distance_km: edge.distance_km, traffic_factor: edge.traffic_factor });
  }
  return adjacency;
}

function reconstructPath(cameFrom, current) {
  const path = [current];
  while (cameFrom[current]) {
    current = cameFrom[current];
    path.unshift(current);
  }
  return path;
}

function dijkstra(nodes, edges, startId, goalId) {
  const adjacency = buildAdjacency(edges);
  const dist = {};
  const cameFrom = {};
  const visited = new Set();
  Object.keys(nodes).forEach((id) => (dist[id] = Infinity));
  dist[startId] = 0;

  while (visited.size < Object.keys(nodes).length) {
    // pick the unvisited node with smallest known distance
    let current = null;
    let currentDist = Infinity;
    for (const id of Object.keys(nodes)) {
      if (!visited.has(id) && dist[id] < currentDist) {
        current = id;
        currentDist = dist[id];
      }
    }
    if (current === null) break; // remaining nodes are unreachable
    if (current === goalId) break;

    visited.add(current);
    for (const neighbor of adjacency[current] || []) {
      const alt = dist[current] + neighbor.cost;
      if (alt < dist[neighbor.to]) {
        dist[neighbor.to] = alt;
        cameFrom[neighbor.to] = current;
      }
    }
  }

  if (dist[goalId] === Infinity) return null; // no path found (e.g. all roads blocked)
  return { path: reconstructPath(cameFrom, goalId), totalTimeMin: dist[goalId], nodesExplored: visited.size };
}

function aStar(nodes, edges, startId, goalId) {
  const adjacency = buildAdjacency(edges);
  const goal = nodes[goalId];

  const heuristic = (nodeId) => {
    const n = nodes[nodeId];
    const straightLineKm = haversineKm(n.lat, n.lng, goal.lat, goal.lng);
    return estimateEtaMinutes(straightLineKm, DEFAULT_EMERGENCY_SPEED_KMH); // optimistic (no traffic) time estimate
  };

  const gScore = {};
  const fScore = {};
  const cameFrom = {};
  Object.keys(nodes).forEach((id) => {
    gScore[id] = Infinity;
    fScore[id] = Infinity;
  });
  gScore[startId] = 0;
  fScore[startId] = heuristic(startId);

  const open = new Set([startId]);
  const visited = new Set();

  while (open.size > 0) {
    let current = null;
    let currentF = Infinity;
    for (const id of open) {
      if (fScore[id] < currentF) {
        current = id;
        currentF = fScore[id];
      }
    }
    if (current === goalId) {
      return { path: reconstructPath(cameFrom, current), totalTimeMin: gScore[current], nodesExplored: visited.size + 1 };
    }

    open.delete(current);
    visited.add(current);

    for (const neighbor of adjacency[current] || []) {
      const tentativeG = gScore[current] + neighbor.cost;
      if (tentativeG < gScore[neighbor.to]) {
        cameFrom[neighbor.to] = current;
        gScore[neighbor.to] = tentativeG;
        fScore[neighbor.to] = tentativeG + heuristic(neighbor.to);
        open.add(neighbor.to);
      }
    }
  }
  return null; // no path found
}

module.exports = { dijkstra, aStar, buildAdjacency };
