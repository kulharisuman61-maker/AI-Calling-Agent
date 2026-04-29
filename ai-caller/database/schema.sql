-- Calls table with comprehensive metrics
CREATE TABLE IF NOT EXISTS calls (
  call_id TEXT PRIMARY KEY,
  call_sid TEXT UNIQUE,
  lead_id TEXT,
  call_type TEXT CHECK(call_type IN ('outbound', 'inbound')),
  phone_number TEXT,
  prompt_version_id TEXT,
  
  -- Timestamps
  initiated_at TEXT,
  answered_at TEXT,
  ended_at TEXT,
  
  -- Metrics (stored as JSON)
  timing_metrics TEXT,
  audio_metrics TEXT,
  conversation_metrics TEXT,
  
  -- Outcomes
  call_status TEXT,
  transfer_successful INTEGER DEFAULT 0,
  call_duration_seconds INTEGER,
  
  -- For RL
  manual_review_status TEXT CHECK(manual_review_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  manual_review_notes TEXT,
  success_score REAL,
  
  -- Additional data from Zoho (JSON)
  additional_data TEXT,
  
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_calls_review ON calls(manual_review_status);
CREATE INDEX IF NOT EXISTS idx_calls_prompt_version ON calls(prompt_version_id);
CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at);

-- Prompt versions table
CREATE TABLE IF NOT EXISTS prompt_versions (
  version_id TEXT PRIMARY KEY,
  version_number INTEGER,
  prompt_text TEXT NOT NULL,
  
  -- Performance tracking
  total_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  avg_time_to_transfer REAL,
  avg_call_duration REAL,
  transfer_rate REAL,
  
  -- Metadata
  created_by TEXT,
  parent_version_id TEXT,
  is_active INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (parent_version_id) REFERENCES prompt_versions(version_id)
);

-- Prompt variables table
CREATE TABLE IF NOT EXISTS prompt_variables (
  variable_id TEXT PRIMARY KEY,
  variable_name TEXT UNIQUE,
  description TEXT,
  example_value TEXT,
  is_required INTEGER DEFAULT 1
);

-- Prompt variable usage
CREATE TABLE IF NOT EXISTS prompt_variable_usage (
  version_id TEXT,
  variable_id TEXT,
  PRIMARY KEY (version_id, variable_id),
  FOREIGN KEY (version_id) REFERENCES prompt_versions(version_id),
  FOREIGN KEY (variable_id) REFERENCES prompt_variables(variable_id)
);

-- Insert default prompt variables
INSERT OR IGNORE INTO prompt_variables (variable_id, variable_name, description, example_value, is_required) VALUES
  ('var_1', 'first_name', 'Lead first name', 'John', 1),
  ('var_2', 'lead_notes', 'Notes about the lead', 'Interested in solar panels', 0),
  ('var_3', 'state', 'Australian state', 'WA', 1),
  ('var_4', 'lead_source', 'Where lead came from', 'Website form', 0);

-- Insert default prompt version
INSERT OR IGNORE INTO prompt_versions (version_id, version_number, prompt_text, created_by, is_active) VALUES
  ('prompt_v1', 1, 'You are a friendly sales assistant calling {{first_name}} in {{state}}, Australia. {{lead_notes}}

Your goal is to:
1. Introduce yourself and the company
2. Understand their needs
3. Answer basic questions
4. Transfer interested leads to Sean (sales specialist)

IMPORTANT RULES:
- Always be polite and professional
- If asked if you are AI, be honest
- If customer says not interested, respect that and end call politely
- Collect the Australian state if not provided before transfer
- For complex questions, transfer to human specialist
- NEVER make guarantees or promises about products/services
- NEVER process payments or make bookings

When the lead shows genuine interest and you have collected their state, use the transfer_to_sales tool to connect them with Sean.', 'manual', 1);
