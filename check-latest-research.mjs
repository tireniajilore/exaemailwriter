import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hvmyfwqnjontmycmkhux.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bXlmd3Fuam9udG15Y21raHV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MzM4NzQsImV4cCI6MjA4MjUwOTg3NH0.vzNteErX5Jne8U-htP53G-amU2-E0MWMiHAJ0ZqNsvo';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Fetching latest research job for Chris Young...\n');

const { data, error } = await supabase
  .from('research_jobs')
  .select('*')
  .eq('recipient_name', 'Chris Young')
  .eq('recipient_company', 'Microsoft')
  .order('created_at', { ascending: false })
  .limit(1);

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.log('No research jobs found for Chris Young at Microsoft');
  process.exit(0);
}

const job = data[0];

console.log('=== LATEST RESEARCH JOB ===');
console.log('Request ID:', job.request_id);
console.log('Status:', job.status);
console.log('Created:', job.created_at);
console.log('Completed:', job.completed_at);

if (job.trace && Array.isArray(job.trace)) {
  console.log('\n=== TRACE (Pipeline Stages) ===');
  job.trace.forEach((stage, i) => {
    console.log(`\n${i + 1}. ${stage.stage}:`);
    console.log('   Status:', stage.status);
    if (stage.counts) {
      console.log('   Counts:', JSON.stringify(stage.counts));
    }
    if (stage.fallback_mode) {
      console.log('   Fallback mode:', stage.fallback_mode);
    }
  });
}

if (job.hypotheses && Array.isArray(job.hypotheses)) {
  console.log('\n=== SEARCH QUERIES (CRITICAL!) ===');
  console.log(`Count: ${job.hypotheses.length} queries`);

  if (job.hypotheses.length === 5) {
    console.log('✅ NEW CODE RUNNING - 5 evidence-based queries');
  } else if (job.hypotheses.length === 3) {
    console.log('❌ OLD CODE RUNNING - 3 topic-based queries');
  }

  console.log('\nQueries:');
  job.hypotheses.forEach((query, i) => {
    console.log(`  ${i + 1}. "${query}"`);

    // Check for artifact keywords
    const artifactKeywords = ['podcast', 'linkedin', 'blog post', 'launch', 'speaking', 'panel', 'interview', 'keynote'];
    const found = artifactKeywords.filter(kw => query.toLowerCase().includes(kw));
    if (found.length > 0) {
      console.log(`     ✅ Artifact keywords: [${found.join(', ')}]`);
    } else {
      console.log(`     ❌ No artifact keywords (likely topic-based query)`);
    }
  });
}

if (job.hooks && Array.isArray(job.hooks)) {
  console.log('\n=== HOOKS EXTRACTED ===');
  console.log(`Count: ${job.hooks.length} hooks`);

  const tierCounts = {
    tier1: 0,
    tier2: 0,
    tier3: 0
  };

  job.hooks.forEach(hook => {
    tierCounts[hook.strength] = (tierCounts[hook.strength] || 0) + 1;
  });

  console.log('Tier distribution:', JSON.stringify(tierCounts));

  console.log('\nHooks:');
  job.hooks.forEach((hook, i) => {
    console.log(`\n  ${i + 1}. ${hook.title}`);
    console.log(`     Strength: ${hook.strength}, Confidence: ${hook.confidence}`);
    console.log(`     Hook: ${hook.hook.substring(0, 100)}...`);
  });
}

console.log('\n=== VERDICT ===');
if (job.hypotheses?.length === 5) {
  console.log('✅ New evidence-based query system IS deployed and working!');
} else if (job.hypotheses?.length === 3) {
  console.log('❌ Old topic-based query system is still running (deployment failed or cached)');
} else {
  console.log('⚠️  Unknown state - check Supabase Edge Function logs manually');
}
