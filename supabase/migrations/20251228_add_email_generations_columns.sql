-- Add missing columns to email_generations table

ALTER TABLE public.email_generations
ADD COLUMN IF NOT EXISTS research_model_name text,
ADD COLUMN IF NOT EXISTS like_you_count integer,
ADD COLUMN IF NOT EXISTS enforcement_results jsonb,
ADD COLUMN IF NOT EXISTS exa_queries jsonb,
ADD COLUMN IF NOT EXISTS exa_results jsonb,
ADD COLUMN IF NOT EXISTS selected_sources jsonb,
ADD COLUMN IF NOT EXISTS researched_facts jsonb;
