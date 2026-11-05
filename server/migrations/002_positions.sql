-- Live driver positions. Only the latest position per driver is kept (no location history):
-- each update overwrites the row, and going offline clears the location.
CREATE TABLE driver_positions (
  user_id     text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  online      boolean NOT NULL DEFAULT false,
  lat         double precision CHECK (lat BETWEEN -90 AND 90),
  lng         double precision CHECK (lng BETWEEN -180 AND 180),
  heading     double precision CHECK (heading >= 0 AND heading < 360),
  speed       double precision CHECK (speed >= 0 AND speed < 100),       -- m/s
  accuracy    double precision CHECK (accuracy >= 0 AND accuracy < 100000), -- metres
  at          timestamptz NOT NULL DEFAULT now()
);
