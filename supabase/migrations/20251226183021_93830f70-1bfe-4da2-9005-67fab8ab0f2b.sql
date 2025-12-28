-- Add V2 research columns to email_generations table
ALTER TABLE public.email_generations
ADD COLUMN IF NOT EXISTS exa_queries jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS exa_results jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS selected_sources jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS researched_facts jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS enforcement_results jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS like_you_count integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS research_model_name text DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN public.email_generations.exa_queries IS 'Array of Exa search queries used';
COMMENT ON COLUMN public.email_generations.exa_results IS 'Array of {url, title, snippet} from Exa';
COMMENT ON COLUMN public.email_generations.selected_sources IS 'Array of URLs used for extraction';
COMMENT ON COLUMN public.email_generations.researched_facts IS 'Array of {claim, source_url, evidence_quote, why_relevant, bridge_type, hook_score}';
COMMENT ON COLUMN public.email_generations.enforcement_results IS '{did_retry: boolean, failures_first_pass: [], failures_retry: []}';
COMMENT ON COLUMN public.email_generations.like_you_count IS 'Count of "like you" occurrences in body';
COMMENT ON COLUMN public.email_generations.research_model_name IS 'Model used for research step';