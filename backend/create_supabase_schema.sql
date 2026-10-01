-- =============================================================================
-- Clucko App Database Schema for Supabase (PostgreSQL 15+)
-- =============================================================================

-- Drop existing tables in reverse dependency order if needed (clean migration)
DROP TABLE IF EXISTS notification_reads CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS qr_scans CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS health_history CASCADE;
DROP TABLE IF EXISTS detection_results CASCADE;
DROP TABLE IF EXISTS image_captures CASCADE;
DROP TABLE IF EXISTS diseases CASCADE;
DROP TABLE IF EXISTS chickens CASCADE;
DROP TABLE IF EXISTS farm_members CASCADE;
DROP TABLE IF EXISTS farms CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20) DEFAULT NULL,
    profile_image TEXT DEFAULT NULL,
    role VARCHAR(20) DEFAULT 'owner',
    farm_name VARCHAR(150) DEFAULT NULL,
    farm_location VARCHAR(255) DEFAULT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    terms_version VARCHAR(20) DEFAULT '2026.1',
    terms_accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Farms
CREATE TABLE farms (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    farm_name VARCHAR(150) NOT NULL,
    farm_location VARCHAR(255) DEFAULT NULL,
    farm_code VARCHAR(10) NOT NULL UNIQUE,
    description TEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    latitude DOUBLE PRECISION DEFAULT NULL,
    longitude DOUBLE PRECISION DEFAULT NULL
);

-- 3. Farm Members
CREATE TABLE farm_members (
    id SERIAL PRIMARY KEY,
    farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'caretaker',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_farm_member UNIQUE (farm_id, user_id)
);

-- 4. Chickens
CREATE TABLE chickens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    farm_id INTEGER REFERENCES farms(id) ON DELETE SET NULL,
    qr_code VARCHAR(100) NOT NULL,
    chicken_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'HEALTHY',
    status_color VARCHAR(20) DEFAULT '#4CAF50',
    location VARCHAR(255) DEFAULT NULL,
    photo_url TEXT DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_farm_qr UNIQUE (farm_id, qr_code)
);

-- 5. Diseases
CREATE TABLE diseases (
    id SERIAL PRIMARY KEY,
    disease_name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT NULL,
    severity VARCHAR(20) DEFAULT 'moderate',
    advisory_action TEXT DEFAULT NULL,
    color VARCHAR(20) DEFAULT '#FF9800'
);

-- 6. Image Captures
CREATE TABLE image_captures (
    id SERIAL PRIMARY KEY,
    chicken_id INTEGER NOT NULL REFERENCES chickens(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    image_type VARCHAR(20) NOT NULL,
    capture_datetime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    image_url TEXT DEFAULT NULL
);

-- 7. Detection Results
CREATE TABLE detection_results (
    id SERIAL PRIMARY KEY,
    image_id INTEGER NOT NULL REFERENCES image_captures(id) ON DELETE CASCADE,
    predicted_condition VARCHAR(100) DEFAULT NULL,
    confidence_score REAL DEFAULT NULL,
    severity_level VARCHAR(20) DEFAULT NULL,
    all_predictions JSONB DEFAULT NULL,
    detected_symptoms JSONB DEFAULT NULL,
    detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Health History
CREATE TABLE health_history (
    id SERIAL PRIMARY KEY,
    chicken_id INTEGER NOT NULL REFERENCES chickens(id) ON DELETE CASCADE,
    disease_id INTEGER REFERENCES diseases(id),
    observation TEXT DEFAULT NULL,
    confidence_score REAL DEFAULT NULL,
    scan_type VARCHAR(20) DEFAULT NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    image_url TEXT DEFAULT NULL,
    user_id INTEGER DEFAULT NULL,
    image_id INTEGER DEFAULT NULL
);

-- 9. Alerts
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    chicken_id INTEGER NOT NULL REFERENCES chickens(id) ON DELETE CASCADE,
    detection_id INTEGER REFERENCES detection_results(id) ON DELETE SET NULL,
    alert_message TEXT NOT NULL,
    alert_level VARCHAR(20) DEFAULT 'warning',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Notifications
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    farm_id INTEGER NOT NULL,
    user_id INTEGER DEFAULT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'info',
    chicken_id INTEGER DEFAULT NULL,
    chicken_name VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 11. Notification Reads
CREATE TABLE notification_reads (
    notification_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id, user_id)
);

-- 12. QR Scans
CREATE TABLE qr_scans (
    id SERIAL PRIMARY KEY,
    chicken_id INTEGER NOT NULL REFERENCES chickens(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    farm_id INTEGER REFERENCES farms(id) ON DELETE SET NULL,
    scanned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. Tasks
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    farm_id INTEGER NOT NULL,
    created_by_user_id INTEGER NOT NULL,
    assigned_to_user_id INTEGER DEFAULT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT NULL,
    due_date VARCHAR(50) NOT NULL,
    due_time VARCHAR(50) DEFAULT NULL,
    color VARCHAR(50) DEFAULT '#4CAF50',
    icon VARCHAR(50) DEFAULT 'calendar',
    completed BOOLEAN DEFAULT FALSE,
    completed_by_user_id INTEGER DEFAULT NULL,
    completed_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast query lookups
CREATE INDEX idx_chickens_user ON chickens(user_id);
CREATE INDEX idx_chickens_farm ON chickens(farm_id);
CREATE INDEX idx_farms_owner ON farms(owner_id);
CREATE INDEX idx_farm_members_user ON farm_members(user_id);
CREATE INDEX idx_health_history_chicken ON health_history(chicken_id);
CREATE INDEX idx_notifications_farm ON notifications(farm_id);
CREATE INDEX idx_notifications_created ON notifications(created_at);
CREATE INDEX idx_tasks_farm_due ON tasks(farm_id, due_date);
CREATE INDEX idx_qr_scans_chicken ON qr_scans(chicken_id);
CREATE INDEX idx_qr_scans_farm ON qr_scans(farm_id);
