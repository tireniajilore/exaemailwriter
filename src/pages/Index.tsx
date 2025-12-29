import { useState, useEffect, useRef } from 'react';
import { ResearchEmailForm } from '@/components/ResearchEmailForm';
import { EmailResult } from '@/components/EmailResult';
import { GenerationProgress } from '@/components/GenerationProgress';
import { HookPicker } from '@/components/HookPicker';
import { supabase } from '@/integrations/supabase/client';
import type { EmailRequest, EmailResponse } from '@/lib/prompt';
import { toast } from 'sonner';

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<EmailResponse | null>(null);
  const [debugTrace, setDebugTrace] = useState<any>(null);
  const [debugData, setDebugData] = useState<any>(null);
  const [currentRequest, setCurrentRequest] = useState<EmailRequest | null>(null);

  // NEW: Research jobs state
  const [researchStatus, setResearchStatus] = useState<'idle' | 'researching' | 'ready' | 'generating'>('idle');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [hooks, setHooks] = useState<any[]>([]);
  const [selectedHook, setSelectedHook] = useState<any | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // NEW: Poll research status
  useEffect(() => {
    if (!requestId || researchStatus !== 'researching') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    const pollStatus = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const response = await fetch(
          `${supabaseUrl}/functions/v1/research-status?requestId=${requestId}`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
            },
          }
        );

        if (!response.ok) {
          console.error('Poll error:', response.status);
          return;
        }

        const data = await response.json();
        console.log('Research status:', data.status, 'Hooks:', data.counts.hooks);

        if (data.status === 'complete') {
          setHooks(data.hooks || []);
          setResearchStatus('ready');
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }

          // Auto-select first hook after 1.2s
          if (data.hooks && data.hooks.length > 0) {
            setTimeout(() => {
              setSelectedHook(data.hooks[0]);
            }, 1200);
          }
        } else if (data.status === 'failed') {
          toast.error('Research failed. Please try again.');
          setResearchStatus('idle');
          setIsLoading(false);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    };

    // Poll every 700ms
    pollIntervalRef.current = setInterval(pollStatus, 700);

    // Initial poll
    pollStatus();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [requestId, researchStatus]);

  // NEW: Generate email when hook is selected
  useEffect(() => {
    if (selectedHook && researchStatus === 'ready' && currentRequest) {
      generateEmailWithHook();
    }
  }, [selectedHook]);

  const generateEmailWithHook = async () => {
    if (!selectedHook || !currentRequest) return;

    setResearchStatus('generating');
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-email', {
        body: {
          ...currentRequest,
          selectedHook,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        toast.error('Failed to generate email. Please try again.');
        return;
      }

      if (data.error) {
        console.error('API error:', data.error);
        toast.error(data.details || data.error);
        return;
      }

      setResult({
        subject: data.subject,
        body: data.body,
      });

      if (data.debug) {
        setDebugData(data.debug);
        if (data.debug.trace) {
          setDebugTrace(data.debug.trace);
        }
      }
    } catch (err) {
      console.error('Error generating email:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
      setResearchStatus('idle');
    }
  };

  const handleSubmit = async (request: EmailRequest) => {
    setIsLoading(true);
    setResult(null);
    setDebugTrace(null);
    setDebugData(null);
    setCurrentRequest(request);
    setHooks([]);
    setSelectedHook(null);

    // NEW FLOW: Start research job
    try {
      const { data, error } = await supabase.functions.invoke('research', {
        body: {
          recipientName: request.recipientName,
          recipientCompany: request.recipientCompany,
          recipientRole: request.recipientRole,
          senderIntent: request.reachingOutBecause,
        },
      });

      if (error) {
        console.error('Research start error:', error);
        toast.error('Failed to start research. Please try again.');
        setIsLoading(false);
        return;
      }

      if (data.error) {
        console.error('Research API error:', data.error);
        toast.error(data.error);
        setIsLoading(false);
        return;
      }

      console.log('Research started:', data.requestId);
      setRequestId(data.requestId);
      setResearchStatus('researching');
    } catch (err) {
      console.error('Error starting research:', err);
      toast.error('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-2xl px-4 py-16">
        {/* Masthead */}
        <header className="mb-12 text-center border-b border-foreground pb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">
            The MBA Networking Toolkit
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl font-medium tracking-tight mb-4 italic">
            Cold Email Assistant
          </h1>
          <p className="text-muted-foreground font-body text-lg">
            Describe a real person. We'll research and draft a personalized email.
          </p>
        </header>

        {/* Main Content */}
        <main>
          <div className="border-t border-foreground pt-8 mb-8">
            <h2 className="font-serif text-2xl font-medium mb-2">Compose Your Message</h2>
            <p className="text-muted-foreground text-sm font-body">
              Complete the fields below. We'll use public information to personalize your email.
            </p>
          </div>

          <ResearchEmailForm onSubmit={handleSubmit} isLoading={isLoading} />
        </main>

        {/* Progress Indicator (shown during research) */}
        {researchStatus === 'researching' && currentRequest && (
          <div className="mt-12 border-t border-foreground pt-8">
            <GenerationProgress
              recipientName={currentRequest.recipientName}
              recipientCompany={currentRequest.recipientCompany}
            />
          </div>
        )}

        {/* Hook Picker (shown when research is complete) */}
        {researchStatus === 'ready' && hooks.length > 0 && (
          <div className="mt-12 border-t border-foreground pt-8">
            <HookPicker
              hooks={hooks}
              selectedHook={selectedHook}
              onSelectHook={setSelectedHook}
            />
          </div>
        )}

        {/* Progress during email generation */}
        {researchStatus === 'generating' && (
          <div className="mt-12 border-t border-foreground pt-8">
            <div className="space-y-4 py-8 text-center">
              <div className="font-serif text-xl font-medium">
                Generating your email...
              </div>
              <p className="text-muted-foreground font-body">
                Using your selected hook to craft a personalized message
              </p>
            </div>
          </div>
        )}

        {/* Results (shown after email generation complete) */}
        {result && !isLoading && (
          <div className="mt-12 border-t border-foreground pt-8">
            <EmailResult result={result} />
          </div>
        )}

        {/* Debug Data - Full Debug Object */}
        {debugData && (
          <div className="mt-8 border-2 border-blue-500/50 rounded p-4 bg-blue-50/10">
            <h3 className="font-mono text-sm font-bold mb-3 text-blue-600 dark:text-blue-400">
              🔍 Debug Data (Full Object)
            </h3>

            {/* Error/Notes section */}
            {debugData.notes && (
              <div className="mb-4 p-3 bg-red-50/10 border border-red-500/30 rounded">
                <h4 className="font-mono text-xs font-semibold mb-2 text-red-600 dark:text-red-400">
                  Research Notes
                </h4>
                <div className="text-xs text-red-500">
                  {debugData.notes}
                </div>
              </div>
            )}

            {/* Key metrics at the top */}
            <div className="mb-4 p-3 bg-background/50 rounded border border-border">
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                {debugData.identityDecision && (
                  <div>
                    <span className="text-muted-foreground">Identity: </span>
                    <span className="font-semibold">{debugData.identityDecision}</span>
                  </div>
                )}
                {debugData.identityConfidence !== undefined && (
                  <div>
                    <span className="text-muted-foreground">Confidence: </span>
                    <span className="font-semibold">{(debugData.identityConfidence * 100).toFixed(0)}%</span>
                  </div>
                )}
                {debugData.exaResearchLatencyMs && (
                  <div>
                    <span className="text-muted-foreground">Research Time: </span>
                    <span className="font-semibold">
                      {(debugData.exaResearchLatencyMs / 1000).toFixed(1)}s
                      {debugData.exaPartialResults && <span className="text-orange-500 ml-1">(partial)</span>}
                    </span>
                  </div>
                )}
                {debugData.citations && (
                  <div>
                    <span className="text-muted-foreground">Citations: </span>
                    <span className="font-semibold">{debugData.citations.length}</span>
                  </div>
                )}
                {debugData.exaResearchId && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Research ID: </span>
                    <span className="font-semibold text-xs">{debugData.exaResearchId}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Exa Debug Info */}
            {(debugData.exa_http_status || debugData.exa_response_bytes || debugData.exa_raw_keys || debugData.exa_parse_error) && (
              <div className="mb-4 p-3 bg-orange-50/10 border border-orange-500/30 rounded">
                <h4 className="font-mono text-xs font-semibold mb-2 text-orange-600 dark:text-orange-400">
                  Exa API Debug
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  {debugData.exa_http_status !== undefined && (
                    <div>
                      <span className="text-muted-foreground">HTTP Status: </span>
                      <span className="font-semibold">{debugData.exa_http_status}</span>
                    </div>
                  )}
                  {debugData.exa_response_bytes !== undefined && (
                    <div>
                      <span className="text-muted-foreground">Response Bytes: </span>
                      <span className="font-semibold">{debugData.exa_response_bytes.toLocaleString()}</span>
                    </div>
                  )}
                  {debugData.exa_raw_keys && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Response Keys: </span>
                      <span className="font-semibold">{debugData.exa_raw_keys.join(', ')}</span>
                    </div>
                  )}
                  {debugData.exa_parse_error && (
                    <div className="col-span-2">
                      <span className="text-red-600 font-semibold">Parse Error: </span>
                      <span className="text-red-500">{debugData.exa_parse_error}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Trace if it exists */}
            {debugTrace && (
              <div className="mb-4">
                <h4 className="font-mono text-xs font-semibold mb-2 text-muted-foreground">Generation Trace:</h4>
                <div className="space-y-2 font-mono text-xs">
                  {debugTrace.map((entry: any, idx: number) => (
                    <div key={idx} className="border-l-2 border-blue-500/30 pl-3 py-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-foreground">{idx + 1}. {entry.stage}</span>
                        {entry.decision && (
                          <span className={entry.decision === 'error' ? 'text-red-500' : 'text-muted-foreground'}>
                            → {entry.decision}
                          </span>
                        )}
                      </div>
                      {entry.counts && (
                        <div className="text-muted-foreground mt-1">
                          {Object.entries(entry.counts).map(([key, value]) => (
                            <span key={key} className="mr-3">
                              {key}: {typeof value === 'number' ? value : String(value)}
                            </span>
                          ))}
                        </div>
                      )}
                      {entry.error && (
                        <div className="text-red-500 mt-1 text-xs">
                          Error: {entry.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full JSON */}
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-mono text-muted-foreground hover:text-foreground">
                View Full JSON
              </summary>
              <pre className="mt-2 p-3 bg-background/80 rounded border border-border text-xs overflow-x-auto">
                {JSON.stringify(debugData, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-border text-center">
          <p className="text-sm text-muted-foreground font-body italic">
            "The best cold emails tell one sharp story, not a résumé."
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
