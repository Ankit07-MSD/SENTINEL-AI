/**
 * Simulated Road Network (Section 12 & 13 demo data)
 *
 * In a real deployment this would come from OpenStreetMap/road-network data
 * fed by live traffic APIs. For this academic project we simulate a small
 * graph of intersections ("nodes") connected by roads ("edges"), each with a
 * base distance and a traffic_factor (1.0 = free-flowing, >1 = congested)
 * so the routing algorithms have something realistic to optimize over
 * besides pure geographic distance — exactly the "Route A vs Route B"
 * example in the spec (shorter route ≠ always faster route).
 *
 * Nodes are keyed by simple IDs so demo requests can reference them
 * directly. lat/lng let the A* heuristic estimate remaining distance.
 */

const nodes = {
  N1: { lat: 28.7041, lng: 77.1025, label: "Incident Site (Fire, Zone A)" },
  N2: { lat: 28.7010, lng: 77.1010, label: "Junction 1" },
  N3: { lat: 28.7000, lng: 77.1060, label: "Junction 2" },
  N4: { lat: 28.7100, lng: 77.0950, label: "Fire Station C" },
  N5: { lat: 28.7080, lng: 77.0990, label: "Junction 3" },
  N6: { lat: 28.7060, lng: 77.1080, label: "Junction 4 (near market — often congested)" },
};

// Edges are bidirectional. traffic_factor multiplies base travel time —
// e.g. 2.5 means "this road currently takes 2.5x longer than free-flow".
// blocked=true removes the edge entirely (used for reroute simulation).
const edges = [
  { from: "N4", to: "N5", distance_km: 0.8, traffic_factor: 1.0, blocked: false },
  { from: "N5", to: "N2", distance_km: 0.9, traffic_factor: 1.1, blocked: false },
  { from: "N2", to: "N1", distance_km: 0.6, traffic_factor: 1.0, blocked: false },
  { from: "N4", to: "N6", distance_km: 1.4, traffic_factor: 1.0, blocked: false },
  { from: "N6", to: "N3", distance_km: 0.9, traffic_factor: 2.6, blocked: false }, // congested market road
  { from: "N3", to: "N1", distance_km: 0.5, traffic_factor: 1.0, blocked: false },
  { from: "N5", to: "N3", distance_km: 1.1, traffic_factor: 1.2, blocked: false },
];

module.exports = { nodes, edges };
