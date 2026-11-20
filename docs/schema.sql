-- ============================================================
-- SENTINEL AI — PostgreSQL Schema
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'operator', 'viewer');
CREATE TYPE incident_type AS ENUM ('fire', 'smoke', 'accident', 'fallen_person', 'crowd_anomaly', 'road_blockage', 'flood', 'other');
CREATE TYPE incident_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE incident_status AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'ASSIGNED', 'DISPATCHED', 'RESOLVED', 'FALSE_ALARM');
CREATE TYPE resource_type AS ENUM ('ambulance', 'fire_truck', 'police', 'rescue');
CREATE TYPE resource_status AS ENUM ('AVAILABLE', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'RETURNING', 'MAINTENANCE', 'OFFLINE');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type incident_type NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'cv',          -- 'cv' | 'manual' | 'sensor'
    detection_confidence NUMERIC(5,2),                  -- from YOLO, e.g. 94.20
    frames_confirmed INT DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    severity_score NUMERIC(5,2),                        -- 0-100, from ML model
    risk_score NUMERIC(5,2),                            -- 0-100
    priority incident_priority,
    status incident_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
    explanation JSONB,                                  -- explainable-AI reasons array
    raw_features JSONB,                                 -- feature vector used by severity model
    detected_at TIMESTAMPTZ DEFAULT now(),
    verified_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id)
);

CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,                   -- e.g. 'A01', 'F02'
    type resource_type NOT NULL,
    capability VARCHAR(40),                             -- e.g. 'ICU', 'basic', 'heavy_rescue'
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    status resource_status NOT NULL DEFAULT 'AVAILABLE',
    current_incident UUID REFERENCES incidents(id),
    station_name VARCHAR(120),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES incidents(id) NOT NULL,
    resource_id UUID REFERENCES resources(id) NOT NULL,
    assignment_score NUMERIC(6,3),                      -- optimizer's objective value
    explanation JSONB,                                  -- why this resource was chosen
    assigned_at TIMESTAMPTZ DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    arrived_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id)               -- human-in-the-loop approval
);

CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id UUID REFERENCES dispatches(id),
    incident_id UUID REFERENCES incidents(id),
    resource_id UUID REFERENCES resources(id),
    distance_km NUMERIC(6,2),
    estimated_time_min NUMERIC(6,2),
    traffic_factor NUMERIC(4,2) DEFAULT 1.0,
    route_geojson JSONB,
    algorithm VARCHAR(20),                              -- 'astar' | 'dijkstra'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_name VARCHAR(60),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    risk_type incident_type,
    time_window VARCHAR(20),                            -- 'morning' | 'afternoon' | 'night' etc
    risk_score NUMERIC(5,2),
    model_version VARCHAR(20),
    prediction_for_date DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE simulation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_name VARCHAR(120),
    scenario_config JSONB,                              -- incidents + resources definition
    strategy VARCHAR(30),                                -- 'baseline_nearest' | 'optimized'
    avg_response_time_min NUMERIC(6,2),
    total_distance_km NUMERIC(8,2),
    resource_utilization NUMERIC(5,2),
    delayed_incidents INT,
    performance_score NUMERIC(6,2),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_priority ON incidents(priority);
CREATE INDEX idx_resources_status ON resources(status);
CREATE INDEX idx_resources_type ON resources(type);
CREATE INDEX idx_dispatches_incident ON dispatches(incident_id);
