import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import api from "../services/api";

const PRIORITY_COLOR = {
  CRITICAL: "#ff7a45",
  HIGH: "#f0a94e",
  MEDIUM: "#e8d24e",
  LOW: "#2dd4bf",
};

const RESOURCE_ICON = {
  ambulance: "A",
  fire_truck: "F",
  police: "P",
  rescue: "R",
};

function incidentIcon(priority) {
  const color = PRIORITY_COLOR[priority] || "#5f6a80";
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #0a0c10;box-shadow:0 0 8px ${color};"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function resourceIcon(type, status) {
  const label = RESOURCE_ICON[type] || "?";
  const bg = status === "AVAILABLE" ? "#2dd4bf" : "#8b5cf6";
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:6px;background:${bg};border:2px solid #0a0c10;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#0a0c10;">${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function displayResourcePositions(resources) {
  const groups = new Map();
  for (const resource of resources) {
    const key = `${Number(resource.latitude).toFixed(6)},${Number(resource.longitude).toFixed(6)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(resource);
  }

  const positions = new Map();
  for (const group of groups.values()) {
    group.sort((a, b) => String(a.code).localeCompare(String(b.code)));
    group.forEach((resource, index) => {
      if (group.length === 1) {
        positions.set(resource.id, [Number(resource.latitude), Number(resource.longitude)]);
        return;
      }
      // Spread co-located station markers within roughly a 20 m radius so every
      // resource can be seen and selected. The popup still reports saved GPS.
      const angle = (2 * Math.PI * index) / group.length - Math.PI / 2;
      const radiusMeters = 20;
      const latOffset = (radiusMeters * Math.cos(angle)) / 111_320;
      const lngOffset = (radiusMeters * Math.sin(angle)) /
        (111_320 * Math.max(Math.cos(Number(resource.latitude) * Math.PI / 180), 0.2));
      positions.set(resource.id, [Number(resource.latitude) + latOffset, Number(resource.longitude) + lngOffset]);
    });
  }
  return positions;
}

function routeKey(coordinates) {
  return coordinates.map(([lat, lng]) => `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`).join(";");
}

function combineIdenticalRoutes(routes) {
  const grouped = new Map();
  for (const route of routes) {
    const key = routeKey(route.coordinates);
    const current = grouped.get(key);
    if (current) {
      current.resourceCodes.push(route.resourceCode);
      current.etas.push(route.eta);
      current.incidentTypes.add(route.incidentType);
      current.methods.add(route.method);
    } else {
      grouped.set(key, {
        ...route,
        key,
        resourceCodes: [route.resourceCode],
        etas: [route.eta],
        incidentTypes: new Set([route.incidentType]),
        methods: new Set([route.method]),
      });
    }
  }
  return [...grouped.values()];
}

function FitActiveRoutes({ routes }) {
  const map = useMap();
  const points = routes.flatMap((route) => route.coordinates);
  const pointKey = points.map((point) => point.join(",")).join(";");

  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [24, 24], maxZoom: 14 });
  }, [map, pointKey]);

  return null;
}

export default function IncidentMap({ incidents, resources }) {
  const [activeRoutes, setActiveRoutes] = useState([]);
  const validIncidents = incidents.filter((incident) =>
    Number.isFinite(Number(incident.latitude)) && Number.isFinite(Number(incident.longitude)) &&
    Math.abs(Number(incident.latitude)) <= 90 && Math.abs(Number(incident.longitude)) <= 180
  );
  const validResources = resources.filter((resource) => resource.location_valid !== false &&
    Number.isFinite(Number(resource.latitude)) && Number.isFinite(Number(resource.longitude)) &&
    Math.abs(Number(resource.latitude)) <= 90 && Math.abs(Number(resource.longitude)) <= 180
  );
  const resourcePositions = displayResourcePositions(validResources);

  useEffect(() => {
    let cancelled = false;
    const assigned = validResources
      .filter((resource) => resource.current_incident)
      .map((resource) => ({
        resource,
        incident: validIncidents.find((item) => String(item.id) === String(resource.current_incident)),
      }))
      .filter(({ incident }) => Boolean(incident));

    if (!assigned.length) {
      setActiveRoutes([]);
      return () => { cancelled = true; };
    }

    Promise.all(assigned.map(async ({ resource, incident }) => {
      try {
        const response = await api.post("/optimization/route", {
          start: { latitude: Number(resource.latitude), longitude: Number(resource.longitude) },
          goal: { latitude: Number(incident.latitude), longitude: Number(incident.longitude) },
          algorithm: "astar",
        });
        const route = response.data;
        if (!route.found || !Array.isArray(route.route_coordinates) || route.route_coordinates.length < 2) return null;
        return {
          key: `${resource.id}-${incident.id}`,
          resourceCode: resource.code,
          incidentType: incident.type,
          eta: route.estimated_time_min,
          method: route.route_method,
          coordinates: route.route_coordinates,
        };
      } catch (error) {
        console.error(`Could not load route for ${resource.code}`, error);
        return null;
      }
    })).then((routes) => {
      if (!cancelled) setActiveRoutes(combineIdenticalRoutes(routes.filter(Boolean)));
    });

    return () => { cancelled = true; };
  }, [incidents, resources]);
  const center = validIncidents.length > 0
    ? [validIncidents[0].latitude, validIncidents[0].longitude]
    : [28.7041, 77.1025];

  return (
    <div style={{ height: 364, borderRadius: 10, overflow: "hidden" }} className="dark-map-wrapper">
      <style>{`
        .dark-map-wrapper .leaflet-tile-pane {
          filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9) saturate(0.8);
        }
      `}</style>
      <MapContainer center={center} zoom={13} style={{ height: 336, width: "100%" }}>
        <FitActiveRoutes routes={activeRoutes} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        {activeRoutes.map((route) => {
          const fallback = route.method === "straight_line_fallback";
          const routeDescription = route.method === "openstreetmap_road_route"
            ? "OpenStreetMap road route · ETA estimate only, no live traffic"
            : fallback
              ? "Straight-line fallback · approximate ETA"
              : "Local simulated road route";
          return (
            <Polyline
              key={route.key}
              positions={route.coordinates}
              pathOptions={{
                color: fallback ? "#94a3b8" : "#38bdf8",
                weight: 4,
                opacity: 0.9,
                ...(fallback ? { dashArray: "8 8" } : {}),
              }}
            >
              <Popup>
                <strong>{route.resourceCodes.join(", ")}</strong><br />
                Assigned incident: {[...route.incidentTypes].join(", ")}<br />
                ETA: {route.etas.join(" / ")} min<br />
                {routeDescription}
              </Popup>
            </Polyline>
          );
        })}
        {validIncidents.map((incident) => (
          <Marker
            key={incident.id}
            position={[incident.latitude, incident.longitude]}
            icon={incidentIcon(incident.priority)}
          >
            <Popup>
              <strong>{incident.type}</strong><br />
              {incident.priority} · {incident.status}<br />
              Confidence: {incident.detection_confidence}%
            </Popup>
          </Marker>
        ))}
        {validResources.map((resource) => (
          <Marker
            key={resource.id}
            position={resourcePositions.get(resource.id)}
            icon={resourceIcon(resource.type, resource.status)}
          >
            <Popup>
              <strong>{resource.code}</strong> ({resource.type})<br />
              Status: {resource.status}<br />
              Capability: {resource.capability}<br />
              Saved location: {Number(resource.latitude).toFixed(5)}, {Number(resource.longitude).toFixed(5)}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div style={{ height: 28, display: "flex", alignItems: "center", gap: 14, padding: "0 8px", color: "var(--text-muted)", fontSize: 10 }}>
        <span><i style={{ display: "inline-block", width: 16, borderTop: "3px solid #38bdf8", marginRight: 5, verticalAlign: "middle" }} />Allocated road route · no live traffic</span>
        <span><i style={{ display: "inline-block", width: 16, borderTop: "3px dashed #94a3b8", marginRight: 5, verticalAlign: "middle" }} />Straight-line fallback</span>
      </div>
    </div>
  );
}
