import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hvmyfwqnjontmycmkhux.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bXlmd3Fuam9udG15Y21raHV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MzM4NzQsImV4cCI6MjA4MjUwOTg3NH0.vzNteErX5Jne8U-htP53G-amU2-E0MWMiHAJ0ZqNsvo';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🧪 Testing mention filtering with Tireni Ajilore / Wealthfront');
console.log('Expected: Generic MBA docs should be filtered out\n');

// Trigger research
const { data, error } = await supabase.functions.invoke('research', {
  body: {
    recipientName: 'Tireni Ajilore',
    recipientCompany: 'Wealthfront',
    recipientRole: 'Product Manager',
    senderIntent: 'Reaching out about wanting to apply for MBA programs in the US.'
  }
});

if (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

console.log('✅ Research job created:', data.requestId);
console.log('⏳ Waiting for completion (checking every 2 seconds)...\n');

// Poll for completion
let attempts = 0;
const maxAttempts = 30;

while (attempts < maxAttempts) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  attempts++;

  const { data: job, error: fetchError } = await supabase
    .from('research_jobs')
    .select('*')
    .eq('id', data.requestId)
    .single();

  if (fetchError) {
    console.error('❌ Fetch error:', fetchError);
    continue;
  }

  console.log(`[${attempts}] Status: ${job.status}`);

  if (job.status === 'complete') {
    console.log('\n✅ Research completed!\n');
    console.log('=== FILTERING RESULTS ===');

    // Check if hooks mention Tireni or Wealthfront
    const hooks = job.hooks || [];
    console.log(`Hooks extracted: ${hooks.length}\n`);

    hooks.forEach((hook, i) => {
      console.log(`Hook ${i + 1}: ${hook.title}`);
      console.log(`  Confidence: ${hook.confidence}, Strength: ${hook.strength}`);

      // Check if evidence quotes mention Tireni or Wealthfront
      const quotes = hook.evidenceQuotes || [];
      const mentionsTireni = quotes.some(q => q.quote.toLowerCase().includes('tireni'));
      const mentionsWealthfront = quotes.some(q => q.quote.toLowerCase().includes('wealthfront'));

      if (mentionsTireni) {
        console.log(`  ✅ Mentions "Tireni" in evidence`);
      } else if (mentionsWealthfront) {
        console.log(`  ✅ Mentions "Wealthfront" in evidence`);
      } else {
        console.log(`  ❌ NO MENTION of Tireni or Wealthfront - SHOULD NOT EXIST!`);
        console.log(`  Evidence: ${quotes.map(q => q.quote.substring(0, 100)).join('; ')}`);
      }
      console.log('');
    });

    console.log('=== VERDICT ===');
    const invalidHooks = hooks.filter(hook => {
      const quotes = hook.evidenceQuotes || [];
      const mentionsTireni = quotes.some(q => q.quote.toLowerCase().includes('tireni'));
      const mentionsWealthfront = quotes.some(q => q.quote.toLowerCase().includes('wealthfront'));
      return !mentionsTireni && !mentionsWealthfront;
    });

    if (invalidHooks.length === 0) {
      console.log('✅ SUCCESS: All hooks mention Tireni or Wealthfront!');
      console.log('✅ Mention filtering is working correctly');
    } else {
      console.log(`❌ FAILURE: ${invalidHooks.length} hooks don't mention Tireni or Wealthfront`);
      console.log('❌ Mention filtering needs adjustment');
    }

    process.exit(invalidHooks.length === 0 ? 0 : 1);
  }

  if (job.status === 'failed') {
    console.log('\n❌ Research failed');
    console.log('Error:', job.error);
    process.exit(1);
  }
}

console.log('\n⏱️ Timeout waiting for research completion');
process.exit(1);
