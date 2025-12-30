// POST /research - Create and execute research job
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

interface ResearchRequest {
  recipientName: string;
  recipientCompany: string;
  recipientRole?: string;
  senderIntent?: string;
  credibilityStory?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const body: ResearchRequest = await req.json();
    const { recipientName, recipientCompany, recipientRole, senderIntent, credibilityStory } = body;

    // Validate required fields
    if (!recipientName || !recipientCompany) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields: recipientName and recipientCompany are required'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`[POST /research] Creating job for ${recipientName} at ${recipientCompany}`);

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Create research job
    const { data, error } = await supabaseClient
      .from('research_jobs')
      .insert({
        status: 'queued',
        recipient_name: recipientName,
        recipient_company: recipientCompany,
        recipient_role: recipientRole ?? null,
        sender_intent: senderIntent ?? null,
        credibility_story: credibilityStory ?? null,
        progress: {},
        urls: [],
        hooks: [],
        partial: false,
        fallback_mode: 'failed'
      })
      .select('id')
      .single();

    if (error) {
      console.error('[POST /research] Database error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to create research job', details: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!data?.id) {
      console.error('[POST /research] Database insert returned no ID');
      return new Response(
        JSON.stringify({ error: 'Failed to create research job - no ID returned' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const requestId = data.id;
    console.log(`[POST /research] Created job ${requestId}, starting research immediately`);

    // CRITICAL FIX: MUST await executeResearch to prevent Deno isolate termination
    // Edge Functions terminate after HTTP response, killing background work
    await executeResearch(requestId, recipientName, recipientCompany, recipientRole, senderIntent, credibilityStory);

    return new Response(
      JSON.stringify({ requestId }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[POST /research] Error:', error);
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

// Background worker function to execute research
async function executeResearch(
  requestId: string,
  name: string,
  company: string,
  role?: string,
  senderIntent?: string,
  credibilityStory?: string
) {
  const startTime = Date.now();

  try {
    console.log(`[executeResearch] Starting for ${requestId}`);

    // Get API keys from environment
    const exaApiKey = Deno.env.get('EXA_API_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    // Create Supabase client with service role
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Helper function to update job status
    async function updateJob(updates: any) {
      const { error } = await supabaseClient
        .from('research_jobs')
        .update(updates)
        .eq('id', requestId);

      if (error) {
        console.error('[executeResearch] Failed to update job:', error);
      }
    }

    if (!exaApiKey || !geminiApiKey) {
      console.error('[executeResearch] Missing API keys - EXA:', !!exaApiKey, 'GEMINI:', !!geminiApiKey);
      await updateJob({
        status: 'failed',
        error: 'Server configuration error: Missing API keys',
        partial: false,
        fallback_mode: 'failed'
      });
      return;
    }

    // Mark research as started
    await updateJob({
      started_at: new Date().toISOString()
    });

    // ==================== PHASE 1: Identity Verification ====================
    console.log(`[executeResearch] Phase 1: Identity verification for ${name}`);
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

    console.log(`[executeResearch] Identity result: ${identityResult.identityDecision} (confidence: ${identityResult.confidence})`);

    if (identityResult.identityDecision === 'FAIL') {
      await updateJob({
        status: 'failed',
        error: `Could not verify identity for ${name} at ${company}`,
        progress: { phase: 1, total: 4, label: 'Identity verification failed' },
        partial: false,
        fallback_mode: 'failed'
      });
      return;
    }

    // ==================== PHASE 2: Content Discovery ====================
    console.log(`[executeResearch] Phase 2: Content discovery`);
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
      geminiApiKey
    });

    console.log(`[executeResearch] Discovered ${discoveryResult.foundCount} sources`);
    console.log(`[executeResearch] Hypotheses used: ${JSON.stringify(discoveryResult.hypotheses)}`);

    await updateJob({
      urls: discoveryResult.urls,
      hypotheses: discoveryResult.hypotheses || []
    });

    if (discoveryResult.urls.length === 0) {
      await updateJob({
        status: 'failed',
        error: `No content sources found for ${name}`,
        progress: { phase: 2, total: 4, label: 'No sources found' },
        partial: false,
        fallback_mode: 'failed'
      });
      return;
    }

    // ==================== PHASE 3: Content Fetching ====================
    console.log(`[executeResearch] Phase 3: Fetching content from ${discoveryResult.urls.length} URLs`);
    await updateJob({
      status: 'fetching',
      progress: { phase: 3, total: 4, label: 'Fetching full content' }
    });

    const fetchResult: ContentFetchResult = await fetchContent({
      urls: discoveryResult.urls,
      exaApiKey,
      geminiApiKey,
      senderIntent
    });

    console.log(`[executeResearch] Fetched ${fetchResult.fetchedCount} documents`);

    if (fetchResult.docs.length === 0) {
      await updateJob({
        status: 'failed',
        error: `Could not fetch content for ${name}`,
        progress: { phase: 3, total: 4, label: 'Content fetch failed' },
        partial: true,
        fallback_mode: 'failed'
      });
      return;
    }

    // ==================== PHASE 4: Hook Extraction ====================
    console.log(`[executeResearch] Phase 4: Extracting hooks from ${fetchResult.docs.length} documents`);
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

    console.log(`[executeResearch] Extracted ${hookResult.hooks.length} hooks (fallback_mode: ${hookResult.fallback_mode})`);

    const isPartial = hookResult.fallback_mode === 'minimal' || hookResult.fallback_mode === 'failed';
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    console.log(`[executeResearch] Research completed in ${durationMs}ms (${(durationMs / 1000).toFixed(2)}s)`);

    await updateJob({
      status: 'complete',
      hooks: hookResult.hooks,
      partial: isPartial,
      fallback_mode: hookResult.fallback_mode,
      progress: { phase: 4, total: 4, label: 'Complete' },
      completed_at: new Date().toISOString()
    });

    console.log(`[executeResearch] Worker completed for ${requestId}`);

  } catch (error) {
    console.error('[executeResearch] Error:', error);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    try {
      const { error: updateError } = await supabaseClient
        .from('research_jobs')
        .update({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          partial: true
        })
        .eq('id', requestId);

      if (updateError) {
        console.error('[executeResearch] Failed to update job status to failed:', updateError);
      }
    } catch (updateErr) {
      console.error('[executeResearch] Error while updating job to failed status:', updateErr);
    }
  }
}
