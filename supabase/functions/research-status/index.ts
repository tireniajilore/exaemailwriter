// GET /research-status - Poll research job status
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map internal status to user-friendly phase labels
const PHASE_LABELS: Record<string, string> = {
  'queued': 'Starting research...',
  'identity': 'Confirming identity',
  'discovery': 'Discovering content sources',
  'fetching': 'Fetching full content',
  'extracting': 'Extracting personalization hooks',
  'complete': 'Research complete',
  'failed': 'Research failed'
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse requestId from query params
    const url = new URL(req.url);
    const requestId = url.searchParams.get('requestId');

    if (!requestId) {
      return new Response(
        JSON.stringify({ error: 'Missing requestId parameter' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`[GET /research-status] Checking status for ${requestId}`);

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Fetch research job
    const { data, error } = await supabaseClient
      .from('research_jobs')
      .select('*')
      .eq('id', requestId)
      .single();

    if (error || !data) {
      console.error('[GET /research-status] Not found:', error);
      return new Response(
        JSON.stringify({ error: 'Research job not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Extract counts from arrays
    const urlCount = Array.isArray(data.urls) ? data.urls.length : 0;
    const hookCount = Array.isArray(data.hooks) ? data.hooks.length : 0;

    // Build response with all requested fields
    const response = {
      requestId: data.id,
      status: data.status,
      phaseLabel: PHASE_LABELS[data.status] || data.status,
      progress: data.progress || {},
      counts: {
        urls: urlCount,
        hooks: hookCount
      },
      urls: data.urls || [],
      hooks: data.hooks || [],
      partial: data.partial || false,
      fallback_mode: data.fallback_mode || 'failed',
      error: data.error || null,
      created_at: data.created_at,
      updated_at: data.updated_at
    };

    console.log(`[GET /research-status] ${requestId}: ${data.status} (${hookCount} hooks, ${urlCount} urls)`);

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[GET /research-status] Error:', error);
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
