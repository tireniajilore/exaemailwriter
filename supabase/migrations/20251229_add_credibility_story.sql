-- Add credibility_story column to research_jobs table
ALTER TABLE public.research_jobs
ADD COLUMN IF NOT EXISTS credibility_story text;
