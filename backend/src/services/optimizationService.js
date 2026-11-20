/**
 * Optimization Service (Section 11 & 12 of the spec)
 *
 * Answers: "Which available resource should respond to which incident?"
 *
 * Approach:
 *   1. Filter resources to only those AVAILABLE (Section 9 — never assume
 *      all resources are free).
 *   2. Build a cost matrix: cost[incident][resource] = weighted ETA, where
 *      - capability mismatch (wrong resource TYPE for the incident) is
 *        made prohibitively expensive so the algorithm avoids it.
 *      - matching a CRITICAL incident is weighted heavier than a LOW one,
 *        so minimizing total cost implicitly prioritizes critical incidents
 *        getting the best (closest/most capable) resource.
 *   3. Solve with the Hungarian Algorithm for a GLOBALLY optimal assignment
 *      (better than each incident greedily grabbing the nearest resource,
 *      which can starve a later, more critical incident of a good option).
 *   4. Also compute a NAIVE "nearest available resource" baseline so the
 *      report/demo can show the % improvement (Section 28).
 */
const { haversineKm, isValidCoordinate } = require("../utils/geo");
const { solve } = require("../utils/hungarian");
const {
  estimateRouteBetweenCoordinates,
  estimateSimulatedRouteBetweenCoordinates,
} = require("./routeService");

// Which resource TYPE an incident type requires (Section 10: capability matching)
const REQUIRED_RESOURCE_TYPE = {
  fire: "fire_truck",
  smoke: "fire_truck",
  accident: "ambulance",
  fallen_person: "ambulance",
  crowd_anomaly: "police",
  road_blockage: "rescue",
  flood: "rescue",
  other: "ambulance",
};

// Priority -> weight. Higher weight means this incident's response time
// contributes more to the total objective, so the optimizer works harder
// to minimize it (i.e. gives critical incidents the best available option).
const PRIORITY_WEIGHT = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

const CAPABILITY_MISMATCH_COST = 100000; // effectively disallows this pairing
const ICU_BONUS_MINUTES = 5; // subtracted from cost when ICU matches a severe case

function requiredResourceType(incident) {
  return incident.required_resource_type || REQUIRED_RESOURCE_TYPE[incident.type] || "ambulance";
}

async function buildRouteMatrix(incidents, resources, estimateRoute = estimateRouteBetweenCoordinates) {
  const matrix = incidents.map(() => resources.map(() => null));
  const jobs = [];
  incidents.forEach((incident, incidentIndex) => {
    const requiredType = requiredResourceType(incident);
    resources.forEach((resource, resourceIndex) => {
      if (resource.type !== requiredType ||
          !isValidCoordinate(resource.latitude, resource.longitude) ||
          !isValidCoordinate(incident.latitude, incident.longitude)) return;
      jobs.push({ incident, resource, incidentIndex, resourceIndex });
    });
  });

  let nextJob = 0;
  const workerCount = Math.min(4, jobs.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextJob < jobs.length) {
      const job = jobs[nextJob++];
      matrix[job.incidentIndex][job.resourceIndex] = await estimateRoute(
        { latitude: job.resource.latitude, longitude: job.resource.longitude },
        { latitude: job.incident.latitude, longitude: job.incident.longitude }
      );
    }
  }));
  return matrix;
}

function buildCostMatrix(incidents, resources, routeMatrix, resourceIndices = resources.map((_, i) => i)) {
  return incidents.map((incident, incidentIndex) => {
    const requiredType = requiredResourceType(incident);
    const weight = PRIORITY_WEIGHT[incident.priority] || 1;

    return resources.map((resource, resourceIndex) => {
      if (resource.type !== requiredType) {
        return CAPABILITY_MISMATCH_COST;
      }
      const routeEstimate = routeMatrix[incidentIndex]?.[resourceIndices[resourceIndex]];
      if (!routeEstimate?.found) return CAPABILITY_MISMATCH_COST;
      let etaMin = routeEstimate.estimated_time_min;

      // capability bonus: ICU ambulance for a high-severity case is preferred
      // even if a basic ambulance is slightly closer (Section 10 example)
      const severity = incident.severity_score || 0;
      if (severity >= 70 && resource.capability === "ICU") {
        etaMin = Math.max(0, etaMin - ICU_BONUS_MINUTES);
      }
      return etaMin * weight;
    });
  });
}

/**
 * Optimal assignment using the Hungarian Algorithm.
 * incidents/resources: arrays of DB rows (already filtered to AVAILABLE resources
 * and unassigned/verified incidents by the caller).
 */
async function optimizeAssignment(incidents, resources, routeMatrix = null, routeEstimator = estimateRouteBetweenCoordinates) {
  if (incidents.length === 0 || resources.length === 0) {
    return {
      assignments: [],
      unassignedIncidents: incidents.map((i) => i.id),
      unassignedDemands: incidents.map((i) => ({
        incident_id: i.id,
        incident_type: i.type,
        assignment_role: i.assignment_role || "Primary response",
        required_resource_type: requiredResourceType(i),
      })),
    };
  }

  const usableResourceIndices = resources
    .map((resource, index) => isValidCoordinate(resource.latitude, resource.longitude) ? index : -1)
    .filter((index) => index >= 0);
  const usableResources = usableResourceIndices.map((index) => resources[index]);
  const excludedResources = resources
    .filter((resource) => !isValidCoordinate(resource.latitude, resource.longitude))
    .map((resource) => ({ id: resource.id, code: resource.code }));

  if (usableResources.length === 0) {
    return {
      assignments: [],
      unassignedIncidents: incidents.map((incident) => incident.id),
      unassignedDemands: incidents.map((incident) => ({
        incident_id: incident.id,
        incident_type: incident.type,
        assignment_role: incident.assignment_role || "Primary response",
        required_resource_type: requiredResourceType(incident),
      })),
      excludedResources,
    };
  }

  routeMatrix ||= await buildRouteMatrix(incidents, resources, routeEstimator);
  const costMatrix = buildCostMatrix(incidents, usableResources, routeMatrix, usableResourceIndices);
  const assignmentIndices = solve(costMatrix); // assignmentIndices[i] = resource index or -1

  const assignments = [];
  const unassignedIncidents = [];
  const unassignedDemands = [];

  const markUnassigned = (incident) => {
    unassignedIncidents.push(incident.id);
    unassignedDemands.push({
      incident_id: incident.id,
      incident_type: incident.type,
      assignment_role: incident.assignment_role || "Primary response",
      required_resource_type: requiredResourceType(incident),
    });
  };

  incidents.forEach((incident, i) => {
    const resourceIdx = assignmentIndices[i];
    const isMismatch = resourceIdx === -1 || costMatrix[i][resourceIdx] >= CAPABILITY_MISMATCH_COST;

    if (isMismatch) {
      markUnassigned(incident);
      return;
    }

    const resource = usableResources[resourceIdx];
    const routeEstimate = routeMatrix[i]?.[usableResourceIndices[resourceIdx]];
    if (!routeEstimate?.found) {
      markUnassigned(incident);
      return;
    }
    const distanceKm = routeEstimate.distance_km;
    const etaMin = routeEstimate.estimated_time_min;

    assignments.push({
      incident_id: incident.id,
      incident_type: incident.type,
      required_resource_type: requiredResourceType(incident),
      assignment_role: incident.assignment_role || "Primary response",
      incident_priority: incident.priority,
      resource_id: resource.id,
      resource_code: resource.code,
      distance_km: Number(distanceKm.toFixed(2)),
      estimated_time_min: Number(etaMin.toFixed(2)),
      route_method: routeEstimate.route_method,
      route_nodes: routeEstimate.route_nodes,
      assignment_score: Number(costMatrix[i][resourceIdx].toFixed(2)),
      explanation: buildExplanation(incident, resource, distanceKm, etaMin, routeEstimate.route_method),
    });
  });

  return { assignments, unassignedIncidents, unassignedDemands, excludedResources };
}

function buildExplanation(incident, resource, distanceKm, etaMin, routeMethod) {
  const reasons = [`${resource.code} is currently AVAILABLE`];
  const requiredType = requiredResourceType(incident);
  if (resource.type === requiredType) {
    reasons.push(`Resource type (${resource.type}) matches incident requirement`);
  }
  if ((incident.severity_score || 0) >= 70 && resource.capability === "ICU") {
    reasons.push("ICU capability matches high-severity incident");
  }
  reasons.push(`Estimated ${distanceKm.toFixed(2)} km / ${etaMin.toFixed(1)} min using ${routeMethod.replaceAll("_", " ")}`);
  if (incident.priority === "CRITICAL") {
    reasons.push("Incident priority is CRITICAL — given top allocation weight");
  }
  return reasons;
}

/**
 * Baseline: naive "nearest available resource" strategy, processed in
 * priority order. Used purely for before/after comparison (Section 28) —
 * NOT used for actual dispatch recommendations.
 */
async function baselineNearestAssignment(incidents, resources, routeMatrix = null, routeEstimator = estimateRouteBetweenCoordinates) {
  routeMatrix ||= await buildRouteMatrix(incidents, resources, routeEstimator);
  const sorted = [...incidents].sort(
    (a, b) => (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0)
  );
  const usedResourceIds = new Set();
  const assignments = [];

  for (const incident of sorted) {
    const requiredType = requiredResourceType(incident);
    let best = null;
    let bestDist = Infinity;

    for (const resource of resources) {
      if (usedResourceIds.has(resource.id)) continue;
      if (resource.type !== requiredType) continue;
      if (!isValidCoordinate(resource.latitude, resource.longitude)) continue;
      if (!isValidCoordinate(incident.latitude, incident.longitude)) continue;
      const d = haversineKm(incident.latitude, incident.longitude, resource.latitude, resource.longitude);
      if (d < bestDist) {
        bestDist = d;
        best = resource;
      }
    }

    if (best) {
      const incidentIndex = incidents.indexOf(incident);
      const resourceIndex = resources.indexOf(best);
      const routeEstimate = routeMatrix[incidentIndex]?.[resourceIndex];
      if (!routeEstimate.found) continue;
      usedResourceIds.add(best.id);
      assignments.push({
        incident_id: incident.id,
        resource_id: best.id,
        resource_code: best.code,
        distance_km: routeEstimate.distance_km,
        estimated_time_min: routeEstimate.estimated_time_min,
        route_method: routeEstimate.route_method,
      });
    }
  }
  return assignments;
}

function averageResponseTime(assignments) {
  if (assignments.length === 0) return 0;
  const total = assignments.reduce((sum, a) => sum + a.estimated_time_min, 0);
  return Number((total / assignments.length).toFixed(2));
}

module.exports = {
  buildRouteMatrix,
  requiredResourceType,
  optimizeAssignment,
  baselineNearestAssignment,
  averageResponseTime,
  REQUIRED_RESOURCE_TYPE,
  estimateSimulatedRouteBetweenCoordinates,
};
