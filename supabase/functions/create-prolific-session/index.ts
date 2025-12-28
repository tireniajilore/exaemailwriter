import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { prolificId, studyId, prolificSessionId, profession, coldEmailFrequency } = body;

    // Validation
    if (!prolificId || typeof prolificId !== 'string' || prolificId.trim().length === 0) {
      console.error('Validation failed: missing prolificId');
      return new Response(
        JSON.stringify({ error: 'Prolific ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const trimmedProlificId = prolificId.trim();
    
    // Allow test IDs (prefixed with "test_" or "TEST_") OR valid Prolific format (24 char alphanumeric)
    const isTestId = /^test_/i.test(trimmedProlificId);
    const isValidProlificFormat = /^[a-zA-Z0-9]{24}$/.test(trimmedProlificId);
    
    if (!isTestId && !isValidProlificFormat) {
      // For non-test IDs, require minimum 3 characters to allow flexibility during development
      if (trimmedProlificId.length < 3) {
        console.error('Validation failed: prolificId too short');
        return new Response(
          JSON.stringify({ error: 'Prolific ID must be at least 3 characters' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log('Accepting non-standard prolificId for testing:', trimmedProlificId);
    }

    if (!profession || typeof profession !== 'string' || profession.trim().length === 0) {
      console.error('Validation failed: missing profession');
      return new Response(
        JSON.stringify({ error: 'Profession is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!coldEmailFrequency || typeof coldEmailFrequency !== 'string') {
      console.error('Validation failed: missing coldEmailFrequency');
      return new Response(
        JSON.stringify({ error: 'Cold email frequency is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Creating prolific session for:', trimmedProlificId);

    // Check if session already exists for this prolific_id (rate limiting / duplicate prevention)
    const { data: existingSession } = await supabase
      .from('prolific_sessions')
      .select('id')
      .eq('prolific_id', trimmedProlificId)
      .maybeSingle();

    if (existingSession) {
      console.log('Session already exists for prolific_id:', trimmedProlificId);
      return new Response(
        JSON.stringify({ sessionId: existingSession.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data, error } = await supabase
      .from('prolific_sessions')
      .insert({
        prolific_id: trimmedProlificId,
        study_id: studyId?.trim() || null,
        prolific_session_id: prolificSessionId?.trim() || null,
        profession: profession.trim(),
        cold_email_frequency: coldEmailFrequency,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Session created:', data.id);

    return new Response(
      JSON.stringify({ sessionId: data.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-prolific-session:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
