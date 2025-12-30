// POST /research-run - Background worker to execute 4-phase research
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  verifyIdentity,
  discoverContent,
  fetchContent,
  extractHooks,
  type IdentityResult,
  type ContentDiscoveryResult,
  type ContentFetchResult,
  type HookExtractionResult
} from "../shared/exa-search.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WorkerRequest {
  requestId: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: WorkerRequest = await req.json();
    const { requestId } = body;

    if (!requestId) {
      return new Response(
        JSON.stringify({ error: 'Missing requestId' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`[research-run] Starting worker for ${requestId}`);

    // Get API keys from environment
    const exaApiKey = Deno.env.get('EXA_API_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!exaApiKey || !geminiApiKey) {
      console.error('[research-run] Missing API keys - EXA:', !!exaApiKey, 'GEMINI:', !!geminiApiKey);

      // Update job to failed status
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      await supabaseClient
        .from('research_jobs')
        .update({
          status: 'failed',
          error: 'Server configuration error: Missing API keys',
          partial: false,
          fallback_mode: 'failed'
        })
        .eq('id', requestId);

      return new Response(
        JSON.stringify({ error: 'Server configuration error: Missing API keys' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Create Supabase client with service role for worker operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch the job
    const { data: job, error: fetchError } = await supabaseClient
      .from('research_jobs')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !job) {
      console.error('[research-run] Job not found:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const name = job.recipient_name ?? '';
    const company = job.recipient_company ?? '';
    const role = job.recipient_role ?? undefined;
    const senderIntent = job.sender_intent ?? undefined;
    const credibilityStory = job.credibility_story ?? undefined;

    // Helper function to update job status
    async function updateJob(updates: any) {
      const { error } = await supabaseClient
        .from('research_jobs')
        .update(updates)
        .eq('id', requestId);

      if (error) {
        console.error('[research-run] Failed to update job:', error);
      }
    }

    try {
      // ==================== PHASE 1: Identity Verification ====================
      console.log(`[research-run] Phase 1: Identity verification for ${name}`);
      await updateJob({
        status: 'identity',
        progress: { phase: 1, total: 4, label: 'Verifying identity' }
      });

      const identityResult: IdentityResult = await verifyIdentity({
        name,
        company,
        role,
        exaApiKey
      });

      console.log(`[research-run] Identity result: ${identityResult.identityDecision} (confidence: ${identityResult.confidence})`);

      // If identity fails, stop early
      if (identityResult.identityDecision === 'FAIL') {
        await updateJob({
          status: 'failed',
          error: `Could not verify identity for ${name} at ${company}`,
          progress: { phase: 1, total: 4, label: 'Identity verification failed' },
          partial: false,
          fallback_mode: 'failed'
        });

        return new Response(
          JSON.stringify({ success: false, error: 'Identity verification failed' }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // ==================== PHASE 2: Content Discovery ====================
      console.log(`[research-run] Phase 2: Content discovery`);
      await updateJob({
        status: 'discovery',
        progress: { phase: 2, total: 4, label: 'Discovering content sources' }
      });

      const discoveryResult: ContentDiscoveryResult = await discoverContent({
        name,
        company,
        role,
        senderIntent,
        credibilityStory,
        exaApiKey,
        geminiApiKey,
        identityConfidence: identityResult.confidence
      });

      console.log(`[research-run] Discovered ${discoveryResult.foundCount} sources`);

      // Update with URLs found
      await updateJob({
        urls: discoveryResult.urls
      });

      // If no URLs found, fail early
      if (discoveryResult.urls.length === 0) {
        await updateJob({
          status: 'failed',
          error: `No content sources found for ${name}`,
          progress: { phase: 2, total: 4, label: 'No sources found' },
          partial: false,
          fallback_mode: 'failed'
        });

        return new Response(
          JSON.stringify({ success: false, error: 'No content sources found' }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // ==================== PHASE 3: Content Fetching ====================
      console.log(`[research-run] Phase 3: Fetching content from ${discoveryResult.urls.length} URLs`);
      await updateJob({
        status: 'fetching',
        progress: { phase: 3, total: 4, label: 'Fetching full content' }
      });

      const fetchResult: ContentFetchResult = await fetchContent({
        urls: discoveryResult.urls,
        exaApiKey,
        senderIntent
      });

      console.log(`[research-run] Fetched ${fetchResult.fetchedCount} documents`);

      // If no content fetched, fail
      if (fetchResult.docs.length === 0) {
        await updateJob({
          status: 'failed',
          error: `Could not fetch content for ${name}`,
          progress: { phase: 3, total: 4, label: 'Content fetch failed' },
          partial: true, // We have URLs but no content
          fallback_mode: 'failed'
        });

        return new Response(
          JSON.stringify({ success: false, error: 'Content fetch failed' }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // ==================== PHASE 4: Hook Extraction ====================
      console.log(`[research-run] Phase 4: Extracting hooks from ${fetchResult.docs.length} documents`);
      await updateJob({
        status: 'extracting',
        progress: { phase: 4, total: 4, label: 'Extracting personalization hooks' }
      });

      const hookResult: HookExtractionResult = await extractHooks({
        docs: fetchResult.docs,
        name,
        company,
        senderIntent,
        geminiApiKey
      });

      console.log(`[research-run] Extracted ${hookResult.hooks.length} hooks (fallback_mode: ${hookResult.fallback_mode})`);

      // Determine if we have partial results
      const isPartial = hookResult.fallback_mode === 'minimal' || hookResult.fallback_mode === 'failed';

      // Mark as complete
      await updateJob({
        status: 'complete',
        hooks: hookResult.hooks,
        partial: isPartial,
        fallback_mode: hookResult.fallback_mode,
        progress: { phase: 4, total: 4, label: 'Complete' }
      });

      console.log(`[research-run] Worker completed for ${requestId}`);

      return new Response(
        JSON.stringify({ success: true, requestId, hookCount: hookResult.hooks.length }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );

    } catch (phaseError) {
      // Handle errors during any phase
      console.error('[research-run] Phase error:', phaseError);

      await updateJob({
        status: 'failed',
        error: phaseError instanceof Error ? phaseError.message : String(phaseError),
        partial: true
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Worker failed during execution',
          details: phaseError instanceof Error ? phaseError.message : String(phaseError)
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error) {
    console.error('[research-run] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
