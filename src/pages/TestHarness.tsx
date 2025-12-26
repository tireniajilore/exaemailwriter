import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, CheckCircle, XCircle, AlertTriangle, Download } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { TEST_CASES, TestCase } from '@/testCases';
import type { EmailResponse } from '@/lib/prompt';

interface TestResult {
  testCase: TestCase;
  response: (EmailResponse & { researchedFacts?: string[] }) | null;
  error: string | null;
  metrics: {
    wordCount: number;
    hasEmDash: boolean;
    hasCliches: string[];
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

function analyzeEmail(body: string): { wordCount: number; hasEmDash: boolean; hasCliches: string[] } {
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const hasEmDash = body.includes('—') || body.includes('--');
  const lowerBody = body.toLowerCase();
  const hasCliches = FORBIDDEN_CLICHES.filter(cliche => lowerBody.includes(cliche.toLowerCase()));
  return { wordCount, hasEmDash, hasCliches };
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
        const { data, error } = await supabase.functions.invoke('generate-email', {
          body: {
            recipientName: testCase.recipientName,
            recipientRole: testCase.recipientRole,
            recipientCompany: testCase.recipientCompany,
            recipientLink: testCase.recipientLink,
            askType: testCase.askType,
            reachingOutBecause: testCase.reachingOutBecause,
            credibilityStory: testCase.credibilityStory,
            sharedAffiliation: testCase.sharedAffiliation,
            source: 'test-harness',
            scenarioName: testCase.label,
          },
        });

        if (error) {
          newResults.push({
            testCase,
            response: null,
            error: error.message,
            metrics: null,
          });
        } else {
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
      researchedFacts: r.response?.researchedFacts || [],
      error: r.error,
      wordCount: r.metrics?.wordCount || null,
      hasEmDash: r.metrics?.hasEmDash || false,
      clichesFound: r.metrics?.hasCliches || [],
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
    const headers = ['ID', 'Label', 'Recipient', 'Ask Type', 'Subject', 'Body', 'Researched Facts', 'Error', 'Word Count', 'Has Em-Dash', 'Clichés Found'];
    const rows = results.map(r => [
      r.testCase.id.toString(),
      r.testCase.label,
      `${r.testCase.recipientName} @ ${r.testCase.recipientCompany}`,
      r.testCase.askType,
      r.response?.subject || '',
      r.response?.body?.replace(/\n/g, '\\n').replace(/"/g, '""') || '',
      r.response?.researchedFacts?.join(' | ') || '',
      r.error || '',
      r.metrics?.wordCount?.toString() || '',
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
          <h1 className="text-3xl font-bold text-foreground mb-2">Email Generator Test Harness</h1>
          <p className="text-muted-foreground">
            This page runs {TEST_CASES.length} predefined scenarios through the research-based email generator. 
            Each test researches the recipient via their public link before generating the email.
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
                        <Badge variant={result.metrics.wordCount <= 200 ? 'default' : 'destructive'}>
                          {result.metrics.wordCount} words
                        </Badge>
                        <Badge variant={result.metrics.hasEmDash ? 'destructive' : 'default'}>
                          {result.metrics.hasEmDash ? (
                            <><XCircle className="h-3 w-3 mr-1" /> Em-dash</>
                          ) : (
                            <><CheckCircle className="h-3 w-3 mr-1" /> No em-dash</>
                          )}
                        </Badge>
                        <Badge variant={result.metrics.hasCliches.length > 0 ? 'destructive' : 'default'}>
                          {result.metrics.hasCliches.length > 0 ? (
                            <><XCircle className="h-3 w-3 mr-1" /> {result.metrics.hasCliches.length} clichés</>
                          ) : (
                            <><CheckCircle className="h-3 w-3 mr-1" /> No clichés</>
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
                      {result.response.researchedFacts && result.response.researchedFacts.length > 0 && (
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Researched Facts Used</p>
                          <div className="bg-primary/5 border border-primary/20 rounded-md p-3">
                            <ul className="text-sm text-foreground/80 space-y-1">
                              {result.response.researchedFacts.map((fact, i) => (
                                <li key={i} className="flex gap-2">
                                  <span className="text-primary font-medium">{i + 1}.</span>
                                  <span>{fact}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
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
                    <p><strong>Public Link:</strong> <a href={result.testCase.recipientLink} target="_blank" rel="noopener noreferrer" className="text-primary underline">{result.testCase.recipientLink}</a></p>
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
            <p className="text-sm mt-2">Each test will research the recipient before generating the email.</p>
          </div>
        )}
      </div>
    </div>
  );
}
