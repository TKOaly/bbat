-- Up Migration

CREATE TYPE job_state AS ENUM ('pending', 'scheduled', 'processing', 'failed', 'succeeded');

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT generate_uuid_v4(),
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  state job_state NOT NULL DEFAULT 'pending'::job_state,
  title TEXT
);

CREATE OR REPLACE FUNCTION job_notify() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('new-job', jsonb_build_object('id', NEW.id)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_notify_trigger
AFTER INSERT ON jobs
FOR EACH ROW
EXECUTE PROCEDURE job_notify();

-- Down Migration
