/**
 * Simulation Service (Section 14: Crisis Simulation)
 *
 * Lets an operator define a hypothetical scenario (N incidents of various
 * types/priorities, M resources of various types) WITHOUT touching real
 * incidents/resources in the database, and see how the baseline
 * (nearest-resource) strategy compares to the optimized (Hungarian
 * Algorithm) strategy — exactly the "Strategy A vs B vs C" comparison in
 * the spec, computed from the real algorithms, not hardcoded.
 */
const {
  optimizeAssignment,
  baselineNearestAssignment,
  averageResponseTime,
  buildRouteMatrix,
  estimateSimulatedRouteBetweenCoordinates,
} = require("./optimizationService");
const { isValidCoordinate } = require("../utils/geo");

async function runScenario(incidents, resources) {
  // Keep the crisis simulator deterministic and independent from external
  // routing availability; live dispatch recommendations use the OSRM adapter.
  const routeMatrix = await buildRouteMatrix(incidents, resources, estimateSimulatedRouteBetweenCoordinates);
  const optimized = await optimizeAssignment(incidents, resources, routeMatrix);
  const baseline = await baselineNearestAssignment(incidents, resources, routeMatrix);

  const optimizedAvg = averageResponseTime(optimized.assignments);
  const baselineAvg = averageResponseTime(baseline);
  const improvementPct = baselineAvg > 0
    ? Number((((baselineAvg - optimizedAvg) / baselineAvg) * 100).toFixed(1))
    : 0;

  const totalDistanceOptimized = optimized.assignments.reduce((s, a) => s + a.distance_km, 0);
  const totalDistanceBaseline = baseline.reduce((s, a) => s + a.distance_km, 0);

  const eligibleResources = resources.filter((resource) =>
    isValidCoordinate(resource.latitude, resource.longitude)
  );
  const resourceUtilization = eligibleResources.length > 0
    ? Number(((optimized.assignments.length / eligibleResources.length) * 100).toFixed(1))
    : 0;

  return {
    incidents_count: incidents.length,
    resources_count: resources.length,
    eligible_resources_count: eligibleResources.length,
    excluded_resources: optimized.excludedResources || [],
    baseline: {
      avg_response_time_min: baselineAvg,
      total_distance_km: Number(totalDistanceBaseline.toFixed(2)),
      incidents_served: baseline.length,
    },
    optimized: {
      avg_response_time_min: optimizedAvg,
      total_distance_km: Number(totalDistanceOptimized.toFixed(2)),
      incidents_served: optimized.assignments.length,
    },
    improvement_percent: improvementPct,
    resource_utilization_percent: resourceUtilization,
    unassigned_incidents: optimized.unassignedIncidents.length,
  };
}

module.exports = { runScenario };
