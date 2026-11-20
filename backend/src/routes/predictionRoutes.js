const express = require("express");
const pool = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { haversineKm } = require("../utils/geo");

const router = express.Router();

// Demo zones spread across the same area our test incidents/resources use.
// In a real deployment these would come from actual administrative zone
// boundaries (wards/sectors), not a fixed list — documented as a
// simplification for this academic demo.
const ZONES = [
  { name: "Zone A (Central)", lat: 28.7041, lng: 77.1025 },
  { name: "Zone B (South)", lat: 28.6800, lng: 77.1200 },
  { name: "Zone C (West)", lat: 28.7100, lng: 77.0950 },
  { name: "Zone D (North)", lat: 28.7150, lng: 77.1080 },
  { name: "Zone E (East)", lat: 28.6950, lng: 77.1180 },
];
const RADIUS_KM = 3;

/**
 * GET /api/prediction/heatmap
 *
 * Computes a historical-activity indicator per demo zone from saved,
 * verified incidents. This is descriptive history, not a trained forecast.
 */
router.get("/heatmap", authenticate, async (req, res) => {
  try {
    const { rows: incidents } = await pool.query(
      `SELECT type, latitude, longitude, severity_score
       FROM incidents
       WHERE verified = TRUE AND status <> 'FALSE_ALARM'`
    );

    const zoneResults = ZONES.map((zone) => {
      const nearby = incidents.filter(
        (i) => haversineKm(zone.lat, zone.lng, i.latitude, i.longitude) <= RADIUS_KM
      );

      const avgSeverity = nearby.length > 0
        ? nearby.reduce((s, i) => s + Number(i.severity_score || 0), 0) / nearby.length
        : 0;

      // Simple descriptive activity score: nearby event count plus average
      // severity. It is not calibrated as a probability or future forecast.
      const riskScore = Math.min(100, nearby.length * 8 + avgSeverity * 0.3);

      const typeCounts = {};
      nearby.forEach((i) => { typeCounts[i.type] = (typeCounts[i.type] || 0) + 1; });
      const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      return {
        zone_name: zone.name,
        latitude: zone.lat,
        longitude: zone.lng,
        historical_incident_count: nearby.length,
        avg_severity: Number(avgSeverity.toFixed(1)),
        risk_score: Number(riskScore.toFixed(1)),
        dominant_incident_type: dominantType,
      };
    });

    res.json({
      zones: zoneResults,
      radius_km: RADIUS_KM,
      history_count: incidents.length,
      source: "saved_verified_incidents",
      is_forecast: false,
      note: "Historical activity indicator only; not a trained prediction or probability.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to compute heatmap" });
  }
});

module.exports = router;
