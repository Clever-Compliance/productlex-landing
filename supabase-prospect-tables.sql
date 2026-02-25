-- ═══════════════════════════════════════════════════════════════
-- ProductLex Prospect Pre-Onboarding Questionnaire — Tables
-- Run in Supabase SQL Editor (same project as expert questionnaire)
-- ═══════════════════════════════════════════════════════════════

-- 1. Prospects — who is filling out the questionnaire
CREATE TABLE IF NOT EXISTS prospects (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL,
  company       text,
  role          text,
  industry      text,
  company_size  text,
  current_phase text DEFAULT 'discovery',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects (email);

-- 2. Prospect Responses — all answers across all phases
CREATE TABLE IF NOT EXISTS prospect_responses (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id   uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  phase         text NOT NULL,          -- 'discovery', 'followup', 'suggestions'
  question_id   text NOT NULL,          -- e.g. 'disc-1', 'ai-followup-3', 'reaction-module-1'
  question_text text,
  question_type text,                   -- 'single_choice', 'multi_choice', 'text', 'yes_no', 'reaction'
  answer_value  text,                   -- JSON-encoded for multi_choice, plain text otherwise
  notes         text,
  answered_at   timestamptz DEFAULT now(),
  UNIQUE (prospect_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_prospect_responses_prospect ON prospect_responses (prospect_id);

-- 3. Prospect AI Outputs — audit trail for AI-generated content
CREATE TABLE IF NOT EXISTS prospect_ai_outputs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id   uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  phase         text NOT NULL,          -- 'followup' or 'suggestions'
  ai_model      text NOT NULL,          -- e.g. 'gpt-4o-mini'
  output_json   jsonb NOT NULL,         -- full AI response
  tokens_used   integer,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_ai_outputs_prospect ON prospect_ai_outputs (prospect_id);

-- ═══════════════════════════════════════════════════════════════
-- RLS Policies — public insert/select/update (same as expert tables)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_ai_outputs ENABLE ROW LEVEL SECURITY;

-- Prospects
CREATE POLICY "Allow public insert on prospects"
  ON prospects FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow public select on prospects"
  ON prospects FOR SELECT TO anon USING (true);

CREATE POLICY "Allow public update on prospects"
  ON prospects FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Prospect Responses
CREATE POLICY "Allow public insert on prospect_responses"
  ON prospect_responses FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow public select on prospect_responses"
  ON prospect_responses FOR SELECT TO anon USING (true);

CREATE POLICY "Allow public update on prospect_responses"
  ON prospect_responses FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Prospect AI Outputs
CREATE POLICY "Allow public insert on prospect_ai_outputs"
  ON prospect_ai_outputs FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow public select on prospect_ai_outputs"
  ON prospect_ai_outputs FOR SELECT TO anon USING (true);
