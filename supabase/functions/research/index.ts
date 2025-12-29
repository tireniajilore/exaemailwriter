// POST /research - Create a new research job
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResearchRequest {
  recipientName: string;
  recipientCompany: string;
  recipientRole?: string;
  senderIntent?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const body: ResearchRequest = await req.json();
    const { recipientName, recipientCompany, recipientRole, senderIntent } = body;

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

    const requestId = data.id;
    console.log(`[POST /research] Created job ${requestId}`);

    // Trigger the worker (non-blocking)
    // Note: In production, this should be handled by a queue or cron job
    // For now, we'll make a fire-and-forget request to the worker
    const workerUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/research-run`;
    fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
      },
      body: JSON.stringify({ requestId })
    }).catch(err => {
      console.error('[POST /research] Failed to trigger worker:', err);
    });

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
