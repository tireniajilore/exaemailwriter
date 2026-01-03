import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hvmyfwqnjontmycmkhux.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bXlmd3Fuam9udG15Y21raHV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MzM4NzQsImV4cCI6MjA4MjUwOTg3NH0.vzNteErX5Jne8U-htP53G-amU2-E0MWMiHAJ0ZqNsvo';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🧪 Testing improved autoprompt discovery with Glenn Kramon');
console.log('Expected: Better hooks about editing/writing expertise (not just resume facts)\n');

// Start research
const { data: startData, error: startError } = await supabase.functions.invoke('research', {
  body: {
    recipientName: 'Glenn Kramon',
    recipientCompany: 'Stanford',
    recipientRole: 'Lecturer',
    senderIntent: "I heard he's really good at writing cold emails and I want to get his advice on a tool I'm building to help students write better cold emails"
  }
});

if (startError) {
  console.error('❌ Research start error:', startError);
  process.exit(1);
}

const requestId = startData.requestId;
console.log(`✅ Research job created: ${requestId}`);
console.log('⏳ Waiting for completion (checking every 3 seconds)...\n');

// Poll for completion
let completed = false;
let attempts = 0;
const maxAttempts = 40; // 2 minutes

while (!completed && attempts < maxAttempts) {
  await new Promise(resolve => setTimeout(resolve, 3000));
  attempts++;

  const { data: job } = await supabase
    .from('research_jobs')
    .select('*')
    .eq('id', requestId)
    .single();

  if (!job) {
    console.log(`[${attempts}] Job not found`);
    continue;
  }

  console.log(`[${attempts}] Status: ${job.status}`);

  if (job.status === 'complete' || job.status === 'failed') {
    completed = true;

    console.log('\n=== DISCOVERY DEBUG ===');
    console.log('Topics extracted:', job.urls?.length ? 'Check logs for topics' : 'N/A');
    console.log('URLs found:', job.urls?.length || 0);
    console.log('Hooks extracted:', job.hooks?.length || 0);
    console.log('Fallback mode:', job.fallback_mode);

    if (job.hooks && job.hooks.length > 0) {
      console.log('\n=== HOOKS EXTRACTED ===');
      job.hooks.forEach((h, i) => {
        console.log(`\nHook ${i + 1}: ${h.title}`);
        console.log(`  Strength: ${h.strength}, Confidence: ${h.confidence}`);
        console.log(`  Hook: ${h.hook.substring(0, 100)}...`);
        console.log(`  Why it works: ${h.whyItWorks.substring(0, 100)}...`);
        console.log(`  Evidence: ${h.evidenceQuotes?.[0]?.quote.substring(0, 100) || 'none'}...`);
      });

      console.log('\n=== ANALYSIS ===');
      const resumeFactsPattern = /(lecturer|professor|editor|alumnus|graduated|degree|work at|works at)/i;
      const motivationPattern = /(advice|how to|framework|strategy|teaches|communication|writing|email)/i;

      job.hooks.forEach((h, i) => {
        const isResumeFact = resumeFactsPattern.test(h.title) && !motivationPattern.test(h.hook);
        const hasMotivation = motivationPattern.test(h.hook) || motivationPattern.test(h.whyItWorks);

        console.log(`Hook ${i + 1}: ${isResumeFact ? '❌ Resume fact' : '✅ Motivation signal'} ${hasMotivation ? '(+motivation)' : ''}`);
      });
    }

    if (job.status === 'failed') {
      console.log('\n❌ Research failed:', job.error);
    }

    break;
  }
}

if (!completed) {
  console.log('\n⏱️  Timeout waiting for completion');
}

console.log('\n📝 To see detailed discovery logs, check Supabase Edge Function logs:');
console.log('   https://supabase.com/dashboard/project/hvmyfwqnjontmycmkhux/logs/edge-functions');
console.log('\n   Look for:');
console.log('   - [extractKeyTopics] Extracted topics');
console.log('   - [discoverContentWithAutoprompt] Score distribution');
console.log('   - [discoverContentWithAutoprompt] Dropped URLs');
