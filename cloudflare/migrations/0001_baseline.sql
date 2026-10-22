-- Accepted master e02b38d + preserved Notion source snapshot.
-- Anonymous quick-session owners are NULL; all authenticated owners retain foreign keys.
CREATE TABLE hosts (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      takeout_onboarding_dismissed INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE meals (
      id TEXT PRIMARY KEY,
      host_id TEXT REFERENCES hosts(id),
      title TEXT NOT NULL,
      description TEXT,
      instructions TEXT,
      notes TEXT,
      total_minutes INTEGER CHECK (total_minutes BETWEEN 1 AND 1440),
      effort TEXT CHECK (effort IN ('easy', 'medium', 'involved')),
      type TEXT DEFAULT 'meal',
      archived INTEGER DEFAULT 0,
      pick_count INTEGER DEFAULT 0,
      temporary INTEGER DEFAULT 0,
      creator_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE meal_ingredients (
      id TEXT PRIMARY KEY,
      meal_id TEXT NOT NULL REFERENCES meals(id),
      amount TEXT NOT NULL DEFAULT '',
      ingredient TEXT NOT NULL,
      display_order INTEGER NOT NULL
    );

CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      host_id TEXT REFERENCES hosts(id),
      invite_code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'open',
      mode TEXT NOT NULL DEFAULT 'home',
      selected_meal_id TEXT REFERENCES meals(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME
    );

CREATE TABLE session_meals (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      meal_id TEXT NOT NULL REFERENCES meals(id),
      display_order INTEGER
    );

CREATE TABLE participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      display_name TEXT NOT NULL,
      host_id TEXT REFERENCES hosts(id),
      submitted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE swipes (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL REFERENCES participants(id),
      session_meal_id TEXT NOT NULL REFERENCES session_meals(id),
      vote INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(participant_id, session_meal_id)
    );

CREATE TABLE session_history (
      id TEXT PRIMARY KEY,
      session_id TEXT UNIQUE NOT NULL REFERENCES sessions(id),
      selected_meal_id TEXT NOT NULL REFERENCES meals(id),
      selected_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE dinner_staples (
      id TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES hosts(id), title TEXT NOT NULL
    );

CREATE TABLE recurring_groceries (
      id TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES hosts(id),
      ingredient TEXT NOT NULL, amount TEXT NOT NULL DEFAULT ''
    );

CREATE TABLE login_sessions (
      id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL
    );

CREATE TABLE plan_entries (
      id TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES hosts(id),
      week TEXT NOT NULL, meal_id TEXT REFERENCES meals(id), kind TEXT NOT NULL,
      title TEXT NOT NULL, date TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE shopping_items (
      id TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES hosts(id), week TEXT NOT NULL,
      entry_id TEXT REFERENCES plan_entries(id), source_title TEXT,
      amount TEXT NOT NULL DEFAULT '', ingredient TEXT NOT NULL,
      aisle TEXT, state TEXT NOT NULL DEFAULT 'needed', display_order INTEGER NOT NULL DEFAULT 0,
      recurring_id TEXT
    );

CREATE TABLE notion_connections (
      host_id TEXT PRIMARY KEY REFERENCES hosts(id),
      token_ciphertext TEXT NOT NULL,
      data_source_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      last_refreshed_at TEXT,
      last_error TEXT
    );

CREATE TABLE notion_recipes (
      host_id TEXT NOT NULL REFERENCES hosts(id),
      data_source_id TEXT NOT NULL,
      page_id TEXT NOT NULL,
      meal_id TEXT NOT NULL UNIQUE REFERENCES meals(id),
      source_url TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      PRIMARY KEY (host_id, data_source_id, page_id)
    );

CREATE INDEX idx_meal_ingredients_meal_order ON meal_ingredients(meal_id, display_order);
CREATE INDEX idx_meals_host_id ON meals(host_id);
CREATE INDEX idx_meals_host_type_archived ON meals(host_id, type, archived);
CREATE INDEX idx_notion_recipes_host ON notion_recipes(host_id);
CREATE INDEX idx_participants_session_id ON participants(session_id);
CREATE INDEX idx_plan_entries_host_week ON plan_entries(host_id, week);
CREATE INDEX idx_recurring_groceries_host ON recurring_groceries(host_id);
CREATE INDEX idx_session_meals_session_id ON session_meals(session_id);
CREATE INDEX idx_sessions_host_id ON sessions(host_id);
CREATE INDEX idx_sessions_invite_code ON sessions(invite_code);
CREATE INDEX idx_shopping_items_host_week ON shopping_items(host_id, week);
CREATE UNIQUE INDEX idx_shopping_recurring_week ON shopping_items(host_id, week, recurring_id);
CREATE INDEX idx_swipes_participant_id ON swipes(participant_id);
