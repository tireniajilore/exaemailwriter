-- Create research_jobs table for background research processing
CREATE TABLE IF NOT EXISTS public.research_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'queued',
  recipient_name text,
  recipient_company text,
  recipient_role text,
  sender_intent text,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  hooks jsonb NOT NULL DEFAULT '[]'::jsonb,
  partial boolean NOT NULL DEFAULT false,
  fallback_mode text NOT NULL DEFAULT 'failed',
  error text,

  CONSTRAINT research_jobs_status_check
    CHECK (status IN ('queued', 'identity', 'discovery', 'fetching', 'extracting', 'complete', 'failed'))
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS research_jobs_created_at_idx ON public.research_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS research_jobs_status_idx ON public.research_jobs(status);
CREATE INDEX IF NOT EXISTS research_jobs_updated_at_idx ON public.research_jobs(updated_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE public.research_jobs ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access (for polling status)
CREATE POLICY "Allow anonymous read access to research_jobs"
  ON public.research_jobs
  FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous insert (for creating jobs)
CREATE POLICY "Allow anonymous insert to research_jobs"
  ON public.research_jobs
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access to research_jobs"
  ON public.research_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_research_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_research_jobs_updated_at
  BEFORE UPDATE ON public.research_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_research_jobs_updated_at();
