import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { ResearchProgressEnhanced } from '@/components/ResearchProgressEnhanced';
import { HookExplorer } from '@/components/HookExplorer';
import { CredibilityRefiner } from '@/components/CredibilityRefiner';
import { EmailPreview } from '@/components/EmailPreview';
import { StepIndicator } from '@/components/StepIndicator';
import { IntentForm, type IntentFormData } from '@/components/IntentForm';
import { supabase } from '@/integrations/supabase/client';
import type { EmailRequest, EmailResponse } from '@/lib/prompt';
import type { WizardStep } from '@/types/wizard';
import { WIZARD_STEPS } from '@/types/wizard';
import { toast } from 'sonner';
import { ResearchEmailForm } from '@/components/ResearchEmailForm';

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<EmailResponse | null>(null);
  const [debugTrace, setDebugTrace] = useState<any>(null);
  const [debugData, setDebugData] = useState<any>(null);
  const [currentRequest, setCurrentRequest] = useState<EmailRequest | null>(null);

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [intentData, setIntentData] = useState<IntentFormData | null>(null);

  // NEW: Research jobs state
  const [researchStatus, setResearchStatus] = useState<'idle' | 'researching' | 'ready' | 'generating'>('idle');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [hooks, setHooks] = useState<any[]>([]);
  const [selectedHook, setSelectedHook] = useState<any | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Debug: Real-time research progress
  const [researchDebug, setResearchDebug] = useState<any>(null);
  const [researchStartTime, setResearchStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // NEW: Poll research status
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollErrorCountRef = useRef<number>(0);
  const MAX_POLL_ERRORS = 5;

  useEffect(() => {
    if (!requestId || researchStatus !== 'researching') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      pollErrorCountRef.current = 0; // Reset error count when not polling
      return;
    }

    // Reset error count when starting new polling session
    pollErrorCountRef.current = 0;

    const pollStatus = async () => {
      // Abort previous request if still in flight
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const response = await fetch(
          `${supabaseUrl}/functions/v1/research-status?requestId=${requestId}`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
            },
            signal: abortControllerRef.current.signal,
          }
        );

        if (!response.ok) {
          console.error('Poll error:', response.status);
          return;
        }

        const data = await response.json();
        console.log('Research status:', data.status, 'Hooks:', data.counts.hooks);

        // Reset error count on successful poll
        pollErrorCountRef.current = 0;

        // Update debug info with full research state
        setResearchDebug({
          requestId: data.requestId,
          status: data.status,
          phaseLabel: data.phaseLabel,
          progress: data.progress,
          counts: data.counts,
          urls: data.urls,
          hooks: data.hooks,
          hypotheses: data.hypotheses,
          partial: data.partial,
          fallback_mode: data.fallback_mode,
          error: data.error,
          updated_at: data.updated_at,
          started_at: data.started_at,
          completed_at: data.completed_at,
          duration_sec: data.duration_sec,
        });

        if (data.status === 'complete') {
          setHooks(data.hooks || []);
          setResearchStatus('ready');
          setIsLoading(false); // Stop showing loading state when hooks are ready
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        } else if (data.status === 'failed') {
          toast.error(data.error || 'Research failed. Please try again.');
          setResearchStatus('idle');
          setWizardStep(1); // Go back to step 1 on failure
          setIsLoading(false);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      } catch (err: any) {
        // Ignore AbortError - it's expected when we cancel requests
        if (err.name === 'AbortError') {
          return;
        }
        console.error('Poll error:', err);

        // Track error count and stop polling after too many failures
        pollErrorCountRef.current += 1;
        if (pollErrorCountRef.current >= MAX_POLL_ERRORS) {
          console.error(`[Polling] Too many errors (${pollErrorCountRef.current}), stopping polling`);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setResearchStatus('idle');
          setIsLoading(false);
          toast.error('Research polling failed. Please try again.');
        }
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [requestId, researchStatus]);

  // Timer effect to track elapsed time
  useEffect(() => {
    if (researchStatus === 'researching' && researchStartTime) {
      const timer = setInterval(() => {
        setElapsedTime(Date.now() - researchStartTime);
      }, 100);

      return () => clearInterval(timer);
    }
  }, [researchStatus, researchStartTime]);

  // NEW: Handle hook selection (Step 2 → Step 3)
  const handleHookSelect = (hook: any) => {
    setSelectedHook(hook);
    setWizardStep(3);
  };

  // Track mounted state to prevent updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // NEW: Handle credibility submission (Step 3 → Step 4)
  const handleCredibilitySubmit = async (data: { credibilityStory: string; sharedAffiliation?: any }) => {
    if (!selectedHook || !intentData) return;

    // Capture current values to avoid stale closures
    const currentSelectedHook = selectedHook;
    const currentIntentData = intentData;

    setIsLoading(true);
    setWizardStep(4);

    try {
      const { data: emailData, error } = await supabase.functions.invoke('generate-email', {
        body: {
          recipientName: currentIntentData.recipientName,
          recipientCompany: currentIntentData.recipientCompany,
          recipientRole: currentIntentData.recipientRole,
          askType: currentIntentData.askType || 'chat',
          reachingOutBecause: currentIntentData.senderIntent,
          credibilityStory: data.credibilityStory,
          sharedAffiliation: data.sharedAffiliation,
          selectedHook: currentSelectedHook,
        },
      });

      // Check if component still mounted
      if (!mountedRef.current) return;

      if (error) {
        console.error('Email generation error:', error);
        toast.error('Failed to generate email. Please try again.');
        setWizardStep(3);
        setIsLoading(false);
        return;
      }

      if (!emailData) {
        console.error('Email generation returned null data');
        toast.error('Failed to generate email. Please try again.');
        setWizardStep(3);
        setIsLoading(false);
        return;
      }

      if (emailData.error) {
        console.error('API error:', emailData.error);
        toast.error(emailData.details || emailData.error);
        setWizardStep(3);
        setIsLoading(false);
        return;
      }

      setResult({
        subject: emailData.subject,
        body: emailData.body,
      });

      if (emailData.debug) {
        setDebugData(emailData.debug);
        if (emailData.debug.trace) {
          setDebugTrace(emailData.debug.trace);
        }
      }
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Error generating email:', err);
      toast.error('Something went wrong. Please try again.');
      setWizardStep(3);
    } finally {
      setIsLoading(false);
    }
  };

  // NEW: Try different hook (Step 4 → Step 3 with different hook)
  const handleTryDifferentHook = (hook: any) => {
    setSelectedHook(hook);
    setResult(null);
    setWizardStep(3);
  };

  // NEW: Edit credibility (Step 4 → Step 3)
  const handleEditCredibility = () => {
    setResult(null);
    setWizardStep(3);
  };

  // NEW: Start over (Step 4 → Step 1)
  const handleStartOver = () => {
    setWizardStep(1);
    setResearchStatus('idle');
    setIntentData(null);
    setRequestId(null);
    setHooks([]);
    setSelectedHook(null);
    setResult(null);
    setResearchDebug(null);
    setDebugData(null);
    setDebugTrace(null);
  };

  const generateEmailWithHook = async (hook: any) => {
    if (!hook || !currentRequest) return;

    setResearchStatus('generating');
    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-email', {
        body: {
          ...currentRequest,
          selectedHook: hook,
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

  // NEW: Handle intent form submission (Step 1 → Step 2)
  const handleIntentSubmit = async (data: IntentFormData) => {
    setIntentData(data);
    setIsLoading(true);
    setResult(null);
    setDebugTrace(null);
    setDebugData(null);
    setResearchDebug(null);
    setHooks([]);
    setSelectedHook(null);
    setResearchStartTime(Date.now());
    setElapsedTime(0);

    // Move to step 2 and start research
    setWizardStep(2);
    setResearchStatus('researching'); // Set status BEFORE async call so polling starts

    try {
      const { data: researchData, error } = await supabase.functions.invoke('research', {
        body: {
          recipientName: data.recipientName,
          recipientCompany: data.recipientCompany,
          recipientRole: data.recipientRole,
          senderIntent: data.senderIntent,
          // credibilityStory will come later in Step 3
        },
      });

      if (error) {
        console.error('Research start error:', error);
        toast.error('Failed to start research. Please try again.');
        setIsLoading(false);
        setWizardStep(1);
        setResearchStatus('idle');
        return;
      }

      if (!researchData) {
        console.error('Research API returned null data');
        toast.error('Failed to start research. Please try again.');
        setIsLoading(false);
        setWizardStep(1);
        setResearchStatus('idle');
        return;
      }

      if (researchData.error) {
        console.error('Research API error:', researchData.error);
        toast.error(researchData.error);
        setIsLoading(false);
        setWizardStep(1);
        setResearchStatus('idle');
        return;
      }

      if (!researchData.requestId) {
        console.error('Research API returned no requestId');
        toast.error('Failed to start research. Please try again.');
        setIsLoading(false);
        setWizardStep(1);
        setResearchStatus('idle');
        return;
      }

      console.log('Research started:', researchData.requestId);
      setRequestId(researchData.requestId);
    } catch (err) {
      console.error('Error starting research:', err);
      toast.error('Something went wrong. Please try again.');
      setIsLoading(false);
      setWizardStep(1);
      setResearchStatus('idle');
    }
  };

  const handleSubmit = async (request: EmailRequest) => {
    setIsLoading(true);
    setResult(null);
    setDebugTrace(null);
    setDebugData(null);
    setResearchDebug(null); // Clear previous research debug
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
          credibilityStory: request.credibilityStory,
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
      {/* Step Indicator - only show when in wizard mode */}
      {wizardStep > 0 && <StepIndicator currentStep={wizardStep} steps={WIZARD_STEPS} />}

      <div className="container mx-auto max-w-2xl px-4 py-16">
        {/* Main Content */}
        <main>
          {/* Step 1: Intent Form */}
          {wizardStep === 1 && (
            <IntentForm onSubmit={handleIntentSubmit} isLoading={isLoading} />
          )}

          {/* Step 2: Research Progress (active phase) */}
          {wizardStep === 2 && researchStatus === 'researching' && intentData && (
            <div className="border-t border-foreground pt-8">
              <ResearchProgressEnhanced
                recipientName={intentData.recipientName}
                recipientCompany={intentData.recipientCompany}
                status={researchDebug?.status || 'queued'}
                phaseLabel={researchDebug?.phaseLabel || 'Starting research...'}
                progress={researchDebug?.progress || { phase: 1, total: 4 }}
                counts={researchDebug?.counts || { urls: 0, hooks: 0, hypotheses: 0 }}
                elapsedTime={elapsedTime}
              />
            </div>
          )}

          {/* Step 2: Hook Selection (complete phase) */}
          {wizardStep === 2 && researchStatus === 'ready' && (
            <div className="border-t border-foreground pt-8">
              <HookExplorer
                hooks={hooks}
                selectedHook={selectedHook}
                onSelectHook={handleHookSelect}
                partial={researchDebug?.partial}
                fallbackMode={researchDebug?.fallback_mode}
              />
            </div>
          )}

          {/* Step 3: Credibility Refiner */}
          {wizardStep === 3 && selectedHook && intentData && (
            <div className="border-t border-foreground pt-8">
              <CredibilityRefiner
                selectedHook={selectedHook}
                recipientName={intentData.recipientName}
                onSubmit={handleCredibilitySubmit}
                isLoading={isLoading}
              />
            </div>
          )}

          {/* Step 4: Email Generation Loading */}
          {wizardStep === 4 && !result && isLoading && (
            <div className="border-t border-foreground pt-8">
              <div className="space-y-6 py-6 max-w-2xl mx-auto">
                <div className="space-y-2">
                  <h2 className="font-serif text-3xl tracking-tight">Writing your email</h2>
                  <p className="text-base text-muted-foreground leading-relaxed">
                    Crafting a message that's short, specific, and grounded in real context
                  </p>
                </div>
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Email Preview */}
          {wizardStep === 4 && result && (
            <div className="border-t border-foreground pt-8">
              <EmailPreview
                result={result}
                selectedHook={selectedHook}
                availableHooks={hooks}
                onTryDifferentHook={handleTryDifferentHook}
                onEditCredibility={handleEditCredibility}
                onStartOver={handleStartOver}
              />
            </div>
          )}

          {/* Fallback: Old form (for now, until we fully migrate) */}
          {wizardStep === 0 && (
            <>
              <div className="border-t border-foreground pt-8 mb-8">
                <h2 className="font-serif text-2xl font-medium mb-2">Compose Your Message</h2>
                <p className="text-muted-foreground text-sm font-body">
                  Complete the fields below. We'll use public information to personalize your email.
                </p>
              </div>
              <ResearchEmailForm onSubmit={handleSubmit} isLoading={isLoading} />
            </>
          )}
        </main>

        {/* Progress during email generation (only for old flow) */}
        {wizardStep === 0 && researchStatus === 'generating' && (
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

        {/* Research Debug (shown in debug mode during/after research) */}
        {researchDebug && currentRequest?.includeDebug && (
          <div className="mt-8 border-2 border-purple-500/50 rounded p-4 bg-purple-50/10">
            <h3 className="font-mono text-sm font-bold mb-3 text-purple-600 dark:text-purple-400">
              🔬 Research Pipeline Debug
            </h3>

            {/* Current Status */}
            <div className="mb-4 p-3 bg-background/50 rounded border border-border">
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <span className="text-muted-foreground">Status: </span>
                  <span className={`font-semibold ${
                    researchDebug.status === 'complete' ? 'text-green-600' :
                    researchDebug.status === 'failed' ? 'text-red-600' :
                    'text-blue-600'
                  }`}>{researchDebug.status}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Phase: </span>
                  <span className="font-semibold">{researchDebug.phaseLabel}</span>
                </div>
                {researchDebug.progress && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Progress: </span>
                      <span className="font-semibold">{researchDebug.progress.phase}/{researchDebug.progress.total}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Fallback: </span>
                      <span className="font-semibold">{researchDebug.fallback_mode}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Counts */}
            {researchDebug.counts && (
              <div className="mb-4 p-3 bg-background/50 rounded border border-border">
                <h4 className="font-mono text-xs font-semibold mb-2">Counts:</h4>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-muted-foreground">Hypotheses: </span>
                    <span className="font-semibold">{researchDebug.counts.hypotheses || 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">URLs: </span>
                    <span className="font-semibold">{researchDebug.counts.urls}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Hooks: </span>
                    <span className="font-semibold">{researchDebug.counts.hooks}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Timing */}
            {researchDebug.duration_sec && (
              <div className="mb-4 p-3 bg-background/50 rounded border border-border">
                <h4 className="font-mono text-xs font-semibold mb-2">Timing:</h4>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-muted-foreground">Duration: </span>
                    <span className="font-semibold">{researchDebug.duration_sec}s</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Completed: </span>
                    <span className="font-semibold">{new Date(researchDebug.completed_at).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Hypotheses */}
            {researchDebug.hypotheses && researchDebug.hypotheses.length > 0 && (
              <div className="mb-4">
                <h4 className="font-mono text-xs font-semibold mb-2">Search Hypotheses ({researchDebug.hypotheses.length}):</h4>
                <div className="space-y-1">
                  {researchDebug.hypotheses.map((hypothesis: string, idx: number) => (
                    <div key={idx} className="text-xs font-mono p-2 bg-background/50 rounded border border-border">
                      {idx + 1}. {hypothesis}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {researchDebug.error && (
              <div className="mb-4 p-3 bg-red-50/10 border border-red-500/30 rounded">
                <h4 className="font-mono text-xs font-semibold mb-2 text-red-600 dark:text-red-400">
                  Error:
                </h4>
                <div className="text-xs text-red-500">
                  {researchDebug.error}
                </div>
              </div>
            )}

            {/* URLs Found */}
            {researchDebug.urls && researchDebug.urls.length > 0 && (
              <div className="mb-4">
                <h4 className="font-mono text-xs font-semibold mb-2">URLs Found ({researchDebug.urls.length}):</h4>
                <div className="space-y-1">
                  {researchDebug.urls.slice(0, 5).map((url: any, idx: number) => (
                    <div key={idx} className="text-xs font-mono p-2 bg-background/50 rounded border border-border">
                      <a href={url.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                        {url.title || url.url}
                      </a>
                    </div>
                  ))}
                  {researchDebug.urls.length > 5 && (
                    <div className="text-xs text-muted-foreground">
                      ... and {researchDebug.urls.length - 5} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Full JSON */}
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-mono text-muted-foreground hover:text-foreground">
                View Full Research State JSON
              </summary>
              <pre className="mt-2 p-3 bg-background/80 rounded border border-border text-xs overflow-x-auto">
                {JSON.stringify(researchDebug, null, 2)}
              </pre>
            </details>
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
