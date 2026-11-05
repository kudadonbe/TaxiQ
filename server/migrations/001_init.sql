-- TaxiQ v3 schema: multi-center (tenant) taxi platform.
-- Every center-owned row carries center_id; the API scopes every query to one center.

CREATE TABLE users (
  id          text PRIMARY KEY,                -- identity provider uid (Firebase now, eFaas later)
  email       text NOT NULL UNIQUE,
  name        text NOT NULL DEFAULT '',
  blocked     boolean NOT NULL DEFAULT false,  -- platform-wide block by a system admin
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Platform roles: dev (testing only, never production) and system_admin.
CREATE TABLE platform_roles (
  user_id     text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('dev', 'system_admin')),
  granted_by  text REFERENCES users(id),
  granted_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE centers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  type                 text NOT NULL CHECK (type IN ('private', 'government')),
  island               text NOT NULL DEFAULT '',
  contact              text NOT NULL DEFAULT '',
  license_no           text NOT NULL DEFAULT '',
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  allows_multi_center  boolean NOT NULL DEFAULT true,
  created_by           text NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  decided_by           text REFERENCES users(id),
  decided_at           timestamptz
);

-- Center staff roles. A user can hold several (e.g. owner + operator).
CREATE TABLE center_staff (
  center_id   uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('owner', 'partner', 'manager', 'operator')),
  added_by    text REFERENCES users(id),
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (center_id, user_id, role)
);

CREATE TABLE vehicles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate             text NOT NULL UNIQUE CHECK (plate ~ '^[A-Z][0-9]{1,6}$'),
  seats             int NOT NULL DEFAULT 4 CHECK (seats BETWEEN 1 AND 20),
  owner_user_id     text NOT NULL REFERENCES users(id),   -- driver or a separate vehicle owner
  permit_expiry     date,
  insurance_expiry  date,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- A driver's membership of one center. This is the "taxi" in that center's queue.
CREATE TABLE memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id       uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  driver_user_id  text NOT NULL REFERENCES users(id),
  vehicle_id      uuid NOT NULL REFERENCES vehicles(id),
  taxi_no         text CHECK (taxi_no ~ '^[1-9][0-9]{0,3}$'),   -- center number, set on approval
  driver_name     text NOT NULL DEFAULT '',
  driver_name_dv  text NOT NULL DEFAULT '',
  driver_phone    text NOT NULL DEFAULT '' CHECK (driver_phone ~ '^([0-9]{7})?$'),
  status          text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'approved', 'rejected', 'left')),
  suspended       jsonb,                                           -- {reason, note, at} or null
  applied_at      timestamptz NOT NULL DEFAULT now(),
  decided_by      text REFERENCES users(id),
  decided_at      timestamptz,
  UNIQUE (center_id, driver_user_id),
  UNIQUE (center_id, taxi_no)
);

-- One queue per center: membership ids in rank order, and who answered the current call.
CREATE TABLE queues (
  center_id   uuid PRIMARY KEY REFERENCES centers(id) ON DELETE CASCADE,
  ord         uuid[] NOT NULL DEFAULT '{}',
  interested  uuid[] NOT NULL DEFAULT '{}',
  version     int NOT NULL DEFAULT 0,
  updated_by  text REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dispatches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id      uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  membership_id  uuid NOT NULL REFERENCES memberships(id),
  from_index     int NOT NULL,
  interested     uuid[] NOT NULL DEFAULT '{}',
  call           jsonb,                  -- passenger details {pickup, pickupAt?, destination, phone, note}
  request_id     uuid,
  reopened       boolean NOT NULL DEFAULT false,
  undone         boolean NOT NULL DEFAULT false,
  by_user        text REFERENCES users(id),
  at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dispatches_center_at ON dispatches (center_id, at DESC);

CREATE TABLE ride_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id          uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  passenger_user_id  text NOT NULL REFERENCES users(id),
  mode               text NOT NULL CHECK (mode IN ('queue', 'direct')),
  pickup             text NOT NULL CHECK (length(pickup) BETWEEN 1 AND 120),
  pickup_lat         double precision,
  pickup_lng         double precision,
  destination        text NOT NULL DEFAULT '' CHECK (length(destination) <= 120),
  phone              text NOT NULL CHECK (phone ~ '^[0-9]{7}$'),
  note               text NOT NULL DEFAULT '' CHECK (length(note) <= 120),
  status             text NOT NULL CHECK (status IN ('offering', 'accepted', 'expired', 'cancelled')),
  offer_to           uuid REFERENCES memberships(id),
  offer_at           timestamptz NOT NULL DEFAULT now(),
  skipped            uuid[] NOT NULL DEFAULT '{}',
  accepted_by        uuid REFERENCES memberships(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
-- One request being offered per passenger at a time.
CREATE UNIQUE INDEX ride_requests_one_open ON ride_requests (passenger_user_id) WHERE status = 'offering';
CREATE INDEX ride_requests_offering ON ride_requests (status, offer_at) WHERE status = 'offering';

-- Subscriptions are recorded only (drivers pay their center); no money is handled.
CREATE TABLE subscriptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id      uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  membership_id  uuid NOT NULL REFERENCES memberships(id),
  period_start   date NOT NULL,
  period_end     date NOT NULL CHECK (period_end >= period_start),
  amount_mvr     numeric(10, 2) NOT NULL CHECK (amount_mvr >= 0),
  status         text NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'paid', 'waived')),
  paid_at        timestamptz,
  recorded_by    text REFERENCES users(id),
  recorded_at    timestamptz NOT NULL DEFAULT now()
);

-- Every state change: who, when, which center, before and after.
CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  center_id  uuid,
  actor      text,
  action     text NOT NULL,
  target     text,
  before     jsonb,
  after      jsonb
);
CREATE INDEX audit_center_at ON audit_log (center_id, at DESC);

-- Per-center API keys for a center's own client apps. Only a hash is stored.
CREATE TABLE api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id   uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  name        text NOT NULL,
  key_hash    text NOT NULL UNIQUE,
  created_by  text REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);
