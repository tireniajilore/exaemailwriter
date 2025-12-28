import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, CheckCircle, XCircle, AlertTriangle, Download, ExternalLink, RefreshCw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiRequest } from '@/lib/api';
import { TEST_CASES, TestCase } from '@/testCases';
import type { ResearchedEmailResponse, HookFact } from '@/lib/prompt';

interface TestResult {
  testCase: TestCase;
  response: ResearchedEmailResponse | null;
  error: string | null;
  metrics: {
    wordCount: number;
    hasEmDash: boolean;
    hasCliches: string[];
    likeYouCount: number;
  } | null;
}

const FORBIDDEN_CLICHES = [
  'keen interest',
  'passionate about',
  'impact at scale',
  'innovative solutions',
  'extensive experience',
  'impressed by',
  'reaching out',
  'excited about',
  'leverage my',
  'synergy',
  'thought leader',
  'game-changer',
  'paradigm shift',
];

function countLikeYou(body: string): number {
  const matches = body.match(/Like you,/g);
  return matches ? matches.length : 0;
}

function analyzeEmail(body: string): { wordCount: number; hasEmDash: boolean; hasCliches: string[]; likeYouCount: number } {
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const hasEmDash = body.includes('—') || body.includes('--');
  const lowerBody = body.toLowerCase();
  const hasCliches = FORBIDDEN_CLICHES.filter(cliche => lowerBody.includes(cliche.toLowerCase()));
  const likeYouCount = countLikeYou(body);
  return { wordCount, hasEmDash, hasCliches, likeYouCount };
}

function getAskTypeLabel(askType: string): string {
  const labels: Record<string, string> = {
    'chat': 'Introductory Chat',
    'feedback': 'Feedback',
    'referral': 'Referral',
    'job': 'Job/Recruiting',
    'other': 'Other',
  };
  return labels[askType] || askType;
}

export default function TestHarness() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const runAllTests = async () => {
    setIsRunning(true);
    setResults([]);
    setProgress(0);

    const newResults: TestResult[] = [];

    for (let i = 0; i < TEST_CASES.length; i++) {
      const testCase = TEST_CASES[i];
      setProgress(i + 1);

      try {
        const { data, error } = await apiRequest<ResearchedEmailResponse>('/api/generate-email', {
          recipientName: testCase.recipientName,
          recipientRole: testCase.recipientRole,
          recipientCompany: testCase.recipientCompany,
          askType: testCase.askType,
          reachingOutBecause: testCase.reachingOutBecause,
          credibilityStory: testCase.credibilityStory,
          sharedAffiliation: testCase.sharedAffiliation,
          source: 'test-harness',
          scenarioName: testCase.label,
        });

        if (error) {
          newResults.push({
            testCase,
            response: null,
            error: error,
            metrics: null,
          });
        } else if (data) {
          const metrics = analyzeEmail(data.body || '');
          newResults.push({
            testCase,
            response: data,
            error: null,
            metrics,
          });
        }
      } catch (err) {
        newResults.push({
          testCase,
          response: null,
          error: err instanceof Error ? err.message : 'Unknown error',
          metrics: null,
        });
      }

      setResults([...newResults]);
    }

    setIsRunning(false);
  };

  const exportAsJSON = () => {
    const exportData = results.map(r => ({
      id: r.testCase.id,
      label: r.testCase.label,
      recipient: `${r.testCase.recipientName} @ ${r.testCase.recipientCompany}`,
      askType: r.testCase.askType,
      subject: r.response?.subject || null,
      body: r.response?.body || null,
      // V2 Research data
      exaQueries: r.response?.exaQueries || [],
      exaResults: r.response?.exaResults || [],
      selectedSources: r.response?.selectedSources || [],
      hookFacts: r.response?.hookFacts || [],
      // Enforcement
      enforcementResults: r.response?.enforcementResults || null,
      // Legacy
      researchedFacts: r.response?.researchedFacts || [],
      // Metrics
      error: r.error,
      wordCount: r.metrics?.wordCount || null,
      likeYouCount: r.metrics?.likeYouCount || 0,
      hasEmDash: r.metrics?.hasEmDash || false,
      clichesFound: r.metrics?.hasCliches || [],
      validatorPassed: r.response?.validatorPassed || false,
      validatorErrors: r.response?.validatorErrors || [],
      retryUsed: r.response?.retryUsed || false,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-test-results-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsCSV = () => {
    const headers = ['ID', 'Label', 'Recipient', 'Ask Type', 'Subject', 'Body', 'Hook Facts', 'Retry Used', 'Validator Passed', 'Error', 'Word Count', 'Like You Count', 'Has Em-Dash', 'Clichés Found'];
    const rows = results.map(r => [
      r.testCase.id.toString(),
      r.testCase.label,
      `${r.testCase.recipientName} @ ${r.testCase.recipientCompany}`,
      r.testCase.askType,
      r.response?.subject || '',
      r.response?.body?.replace(/\n/g, '\\n').replace(/"/g, '""') || '',
      r.response?.hookFacts?.map(f => f.claim).join(' | ') || '',
      r.response?.retryUsed ? 'Yes' : 'No',
      r.response?.validatorPassed ? 'Yes' : 'No',
      r.error || '',
      r.metrics?.wordCount?.toString() || '',
      r.metrics?.likeYouCount?.toString() || '0',
      r.metrics?.hasEmDash ? 'Yes' : 'No',
      r.metrics?.hasCliches?.join('; ') || '',
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-test-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const HookFactDisplay = ({ fact }: { fact: HookFact }) => (
    <div className="bg-primary/5 border border-primary/20 rounded-md p-3 text-sm space-y-1">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-foreground">{fact.claim}</p>
        <Badge variant="outline" className="text-xs shrink-0">
          {fact.bridge_type} • {fact.hook_score}/5
        </Badge>
      </div>
      <p className="text-muted-foreground italic">"{fact.evidence_quote}"</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <a href={fact.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          Source
        </a>
        <span>•</span>
        <span>{fact.why_relevant}</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-5xl py-8 px-4">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              Internal Testing Only
            </Badge>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Email Generator Test Harness (V2)</h1>
          <p className="text-muted-foreground">
            This page runs {TEST_CASES.length} predefined scenarios through the V2 research-based email generator with Exa integration and "Like you," enforcement.
          </p>
        </header>

        <div className="mb-8 flex gap-3">
          <Button
            onClick={runAllTests}
            disabled={isRunning}
            size="lg"
            className="gradient-primary text-primary-foreground"
          >
            {isRunning ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Running... ({progress}/{TEST_CASES.length})
              </>
            ) : (
              <>
                <Play className="mr-2 h-5 w-5" />
                Run All Tests
              </>
            )}
          </Button>

          {results.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="lg">
                  <Download className="mr-2 h-5 w-5" />
                  Export Results
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={exportAsJSON}>
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportAsCSV}>
                  Export as CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {results.length > 0 && (
          <div className="space-y-6">
            {results.map((result) => (
              <div
                key={result.testCase.id}
                className="border border-border rounded-lg bg-card overflow-hidden"
              >
                <div className="bg-muted/50 px-4 py-3 border-b border-border">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-foreground">
                        #{result.testCase.id}: {result.testCase.label}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {result.testCase.recipientName} • {result.testCase.recipientRole} @ {result.testCase.recipientCompany}
                      </p>
                    </div>
                    {result.metrics && (
                      <div className="flex gap-2 flex-wrap justify-end">
                        <Badge variant={result.metrics.wordCount >= 90 && result.metrics.wordCount <= 170 ? 'default' : 'destructive'}>
                          {result.metrics.wordCount} words
                        </Badge>
                        <Badge variant={result.metrics.likeYouCount === 1 ? 'default' : 'destructive'}>
                          {result.metrics.likeYouCount === 1 ? (
                            <><CheckCircle className="h-3 w-3 mr-1" /> "Like you,"</>
                          ) : (
                            <><XCircle className="h-3 w-3 mr-1" /> {result.metrics.likeYouCount}x "Like you,"</>
                          )}
                        </Badge>
                        {result.response?.retryUsed && (
                          <Badge variant="secondary">
                            <RefreshCw className="h-3 w-3 mr-1" /> Retry
                          </Badge>
                        )}
                        <Badge variant={result.response?.validatorPassed ? 'default' : 'destructive'}>
                          {result.response?.validatorPassed ? (
                            <><CheckCircle className="h-3 w-3 mr-1" /> Valid</>
                          ) : (
                            <><XCircle className="h-3 w-3 mr-1" /> Invalid</>
                          )}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4">
                  {result.error ? (
                    <div className="text-destructive bg-destructive/10 rounded-md p-3">
                      Error: {result.error}
                    </div>
                  ) : result.response ? (
                    <div className="space-y-4">
                      {/* Research Results */}
                      <details className="group">
                        <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2">
                          <span>Research Details</span>
                          {/* Identity Anchor Status */}
                          {result.response.debug?.identityAnchor && (
                            <Badge 
                              variant={result.response.debug.identityAnchor.confirmed ? 'default' : 'destructive'} 
                              className="text-xs"
                            >
                              {result.response.debug.identityAnchor.confirmed ? (
                                <><CheckCircle className="h-3 w-3 mr-1" /> Identity confirmed</>
                              ) : (
                                <><XCircle className="h-3 w-3 mr-1" /> Identity failed</>
                              )}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {result.response.hookFacts?.length || 0} hook facts
                          </Badge>
                          {result.response.exaResults && result.response.exaResults.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {result.response.exaResults.length} Exa results
                            </Badge>
                          )}
                        </summary>
                        <div className="mt-3 space-y-3">
                          {/* Identity Anchor Details */}
                          {result.response.debug?.identityAnchor && (
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                                Identity Anchor {result.response.debug.identityAnchor.confirmed ? '✓' : '✗'}
                              </p>
                              <div className={`rounded-md p-2 text-xs space-y-1 ${result.response.debug.identityAnchor.confirmed ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                                {result.response.debug.identityAnchor.notes && (
                                  <p className="text-muted-foreground italic">{result.response.debug.identityAnchor.notes}</p>
                                )}
                                {result.response.debug.identityAnchor.identityUrls && result.response.debug.identityAnchor.identityUrls.length > 0 && (
                                  <div>
                                    <span className="text-muted-foreground">Confirmed URLs: </span>
                                    {result.response.debug.identityAnchor.identityUrls.map((url: string, i: number) => (
                                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block text-primary hover:underline truncate">
                                        {url}
                                      </a>
                                    ))}
                                  </div>
                                )}
                                {result.response.debug.identityAnchor.identityScores && result.response.debug.identityAnchor.identityScores.length > 0 && (
                                  <details className="mt-1">
                                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Identity Scores ({result.response.debug.identityAnchor.identityScores.length})</summary>
                                    <div className="mt-1 space-y-1 pl-2 border-l-2 border-muted">
                                      {result.response.debug.identityAnchor.identityScores.slice(0, 5).map((s: any, i: number) => (
                                        <div key={i} className="text-xs">
                                          <span className={`font-mono ${s.isIdentityMatch ? 'text-green-600' : 'text-red-600'}`}>
                                            [{s.score}] {s.isIdentityMatch ? '✓' : '✗'}
                                          </span>
                                          <span className="text-muted-foreground ml-1 truncate block">{s.url.substring(0, 60)}...</span>
                                          <span className="text-muted-foreground/60 text-[10px]">{s.reasons.join(', ')}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {/* Exa Queries */}
                          {result.response.exaQueries && result.response.exaQueries.length > 0 && (
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Exa Queries</p>
                              <div className="bg-muted/30 rounded-md p-2 text-xs space-y-1">
                                {result.response.exaQueries.map((q, i) => (
                                  <p key={i} className="font-mono text-foreground/80">{i + 1}. {q}</p>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Selected Sources */}
                          {result.response.selectedSources && result.response.selectedSources.length > 0 && (
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Selected Sources for Extraction</p>
                              <div className="bg-muted/30 rounded-md p-2 text-xs space-y-1">
                                {result.response.selectedSources.map((url, i) => (
                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block text-primary hover:underline truncate">
                                    {url}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Hook Facts */}
                          {result.response.hookFacts && result.response.hookFacts.length > 0 ? (
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Hook Facts</p>
                              <div className="space-y-2">
                                {result.response.hookFacts.map((fact, i) => (
                                  <HookFactDisplay key={i} fact={fact} />
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No hook facts extracted (email generated without specific research)</p>
                          )}
                        </div>
                      </details>

                      {/* Enforcement Results */}
                      {result.response.enforcementResults && (result.response.enforcementResults.failures_first_pass.length > 0 || result.response.enforcementResults.did_retry) && (
                        <details className="group">
                          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2">
                            <span>Enforcement Details</span>
                            {result.response.enforcementResults.did_retry && (
                              <Badge variant="secondary" className="text-xs">
                                <RefreshCw className="h-3 w-3 mr-1" /> Retry used
                              </Badge>
                            )}
                          </summary>
                          <div className="mt-3 space-y-2">
                            {result.response.enforcementResults.failures_first_pass.length > 0 && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-amber-600 mb-1">First Pass Failures</p>
                                <ul className="bg-amber-500/10 border border-amber-500/20 rounded-md p-2 text-xs space-y-1">
                                  {result.response.enforcementResults.failures_first_pass.map((f, i) => (
                                    <li key={i} className="text-amber-700">{f}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {result.response.enforcementResults.failures_retry.length > 0 && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-destructive mb-1">Retry Failures (Still Present)</p>
                                <ul className="bg-destructive/10 border border-destructive/20 rounded-md p-2 text-xs space-y-1">
                                  {result.response.enforcementResults.failures_retry.map((f, i) => (
                                    <li key={i} className="text-destructive">{f}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </details>
                      )}

                      {/* Email Output */}
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Subject</p>
                        <p className="font-medium text-foreground">{result.response.subject}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Body</p>
                        <div className="text-sm text-foreground/90 whitespace-pre-wrap bg-muted/30 rounded-md p-3">
                          {result.response.body}
                        </div>
                      </div>

                      {/* Validation Errors (if any remain) */}
                      {result.response.validatorErrors && result.response.validatorErrors.length > 0 && (
                        <div>
                          <p className="text-xs uppercase tracking-wide text-destructive mb-1">Validation Errors</p>
                          <ul className="bg-destructive/10 rounded-md p-2 text-xs space-y-1">
                            {result.response.validatorErrors.map((err, i) => (
                              <li key={i} className="text-destructive">{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Detected Clichés */}
                      {result.metrics && result.metrics.hasCliches.length > 0 && (
                        <div>
                          <p className="text-xs uppercase tracking-wide text-destructive mb-1">Detected Clichés</p>
                          <div className="flex gap-2 flex-wrap">
                            {result.metrics.hasCliches.map((cliche, i) => (
                              <Badge key={i} variant="destructive" className="text-xs">
                                "{cliche}"
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                <details className="border-t border-border">
                  <summary className="px-4 py-2 text-sm text-muted-foreground cursor-pointer hover:bg-muted/30">
                    View Input Details
                  </summary>
                  <div className="px-4 py-3 text-xs space-y-2 bg-muted/20">
                    <p><strong>Recipient:</strong> {result.testCase.recipientName}, {result.testCase.recipientRole} at {result.testCase.recipientCompany}</p>
                    <p><strong>Ask Type:</strong> {getAskTypeLabel(result.testCase.askType)}</p>
                    <p><strong>Reaching Out Because:</strong> {result.testCase.reachingOutBecause}</p>
                    <p><strong>Credibility Story:</strong> {result.testCase.credibilityStory}</p>
                    {result.testCase.sharedAffiliation && (
                      <p><strong>Shared Background:</strong> {result.testCase.sharedAffiliation.types.join(', ')} — {result.testCase.sharedAffiliation.name}{result.testCase.sharedAffiliation.detail ? ` (${result.testCase.sharedAffiliation.detail})` : ''}</p>
                    )}
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && !isRunning && (
          <div className="text-center py-16 text-muted-foreground">
            <p>Click "Run All Tests" to generate emails for all {TEST_CASES.length} test scenarios.</p>
            <p className="text-sm mt-2">Each test will use Exa to research the recipient before generating the email with "Like you," enforcement.</p>
          </div>
        )}
      </div>
    </div>
  );
}
