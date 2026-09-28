CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions_auth (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  equipment TEXT NOT NULL DEFAULT '',
  garmin_image_url TEXT,
  garmin_video_url TEXT
);

CREATE TABLE workout_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE workout_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES workout_plans(id),
  label TEXT NOT NULL,
  focus_name TEXT NOT NULL,
  day_order INTEGER NOT NULL
);

CREATE TABLE workout_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_day_id INTEGER NOT NULL REFERENCES workout_days(id),
  exercise_id INTEGER REFERENCES exercises(id),
  custom_name TEXT,
  sets INTEGER NOT NULL,
  reps TEXT NOT NULL,
  exercise_order INTEGER NOT NULL,
  youtube_url TEXT
);

CREATE TABLE workout_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  workout_day_id INTEGER REFERENCES workout_days(id),
  date TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_counted INTEGER
);

CREATE INDEX idx_workout_plans_user_active ON workout_plans(user_id, is_active);
CREATE INDEX idx_workout_days_plan ON workout_days(plan_id);
CREATE INDEX idx_workout_exercises_day ON workout_exercises(workout_day_id);
CREATE INDEX idx_workout_sessions_user_date ON workout_sessions(user_id, date);
