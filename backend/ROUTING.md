# Road routing configuration

The dashboard route endpoint and resource-assignment ETA use the same backend
route estimator. With `ROUTING_PROVIDER=osrm`, the backend requests driving
geometry, distance, and estimated duration from OSRM using OpenStreetMap road
data. This draws a path that follows mapped roads. OSRM's returned duration is
not live traffic data and is not an emergency-vehicle ETA guarantee.

Set these values in `backend/.env` (or use the defaults):

```env
ROUTING_PROVIDER=osrm
OSRM_BASE_URL=https://router.project-osrm.org
OSRM_TIMEOUT_MS=2500
```

If the provider times out, reports no route, or `ROUTING_PROVIDER` is set to
another value, the backend falls back to the local simulated road graph and
then its straight-line estimate for locations outside that graph. This keeps
the dashboard and assignment endpoint available. A short in-memory cache and
four-request concurrency limit reduce repeated provider traffic.

The crisis simulation intentionally continues to use the local graph so its
scenario comparison remains deterministic and does not rely on network
availability. The AI inference service and YOLO model are unchanged.

The default public OSRM endpoint is intended for light, non-commercial demos;
it has no project SLA. Coordinates sent to it leave the local backend. For
production or sensitive incident locations, configure an approved provider or
self-host an OSRM instance and review privacy, availability, and usage terms.
