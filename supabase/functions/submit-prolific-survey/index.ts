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
    const { 
      sessionId,
      comparisonRating,
      likelihoodChange,
      likelihoodReasons,
      changesBeforeSending,
      whatFeltOff,
      mostUsefulPart,
      whatsMissing,
    } = body;

    // Validation
    if (!sessionId || typeof sessionId !== 'string') {
      console.error('Validation failed: missing sessionId');
      return new Response(
        JSON.stringify({ error: 'Session ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (comparisonRating !== undefined && (typeof comparisonRating !== 'number' || comparisonRating < 1 || comparisonRating > 5)) {
      console.error('Validation failed: invalid comparisonRating');
      return new Response(
        JSON.stringify({ error: 'Comparison rating must be between 1 and 5' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validLikelihoodChanges = ['significantly_more', 'somewhat_more', 'no_change', 'less_likely'];
    if (likelihoodChange && !validLikelihoodChanges.includes(likelihoodChange)) {
      console.error('Validation failed: invalid likelihoodChange');
      return new Response(
        JSON.stringify({ error: 'Invalid likelihood change value' }),
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

    // Verify session exists and check if already completed
    const { data: session, error: sessionError } = await supabase
      .from('prolific_sessions')
      .select('id, completed_at')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      console.error('Session not found:', sessionId);
      return new Response(
        JSON.stringify({ error: 'Invalid session' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prevent duplicate survey submissions
    if (session.completed_at) {
      console.error('Survey already submitted for session:', sessionId);
      return new Response(
        JSON.stringify({ error: 'Survey has already been submitted for this session' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Submitting survey for session:', sessionId);

    // Insert survey response with new schema
    const { data: survey, error: insertError } = await supabase
      .from('prolific_post_survey')
      .insert({
        session_id: sessionId,
        comparison_rating: comparisonRating,
        likelihood_change: likelihoodChange,
        likelihood_reasons: likelihoodReasons || null,
        changes_before_sending: changesBeforeSending || null,
        what_felt_off: whatFeltOff?.substring(0, 5000) || null,
        most_useful_part: mostUsefulPart || null,
        whats_missing: whatsMissing?.substring(0, 5000) || null,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to insert survey:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to submit survey' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark session as completed
    const { error: updateError } = await supabase
      .from('prolific_sessions')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Failed to mark session complete:', updateError);
    }

    console.log('Survey submitted:', survey.id);

    return new Response(
      JSON.stringify({ surveyId: survey.id, success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in submit-prolific-survey:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
