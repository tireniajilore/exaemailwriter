import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProlificLayout } from '@/components/prolific/ProlificLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useProlific } from '@/contexts/ProlificContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Copy, Check } from 'lucide-react';

const PROLIFIC_COMPLETION_CODE = 'CYR4O8BL';
const PROLIFIC_COMPLETION_URL = 'https://app.prolific.com/submissions/complete?cc=CYR4O8BL';

// Q1: Comparison to usual emails
const COMPARISON_OPTIONS = [
  { value: '1', label: 'Much worse' },
  { value: '2', label: 'Somewhat worse' },
  { value: '3', label: 'About the same' },
  { value: '4', label: 'Somewhat better' },
  { value: '5', label: 'Much better' },
];

// Q2: Would this make you more likely to send cold emails?
const LIKELIHOOD_OPTIONS = [
  { value: 'significantly_more', label: 'Yes, significantly more likely' },
  { value: 'somewhat_more', label: 'Yes, somewhat more likely' },
  { value: 'no_change', label: 'No change' },
  { value: 'less_likely', label: 'Less likely' },
];

// Q3: Why would this make you more likely? (select up to 2)
const LIKELIHOOD_REASONS = [
  { value: 'lower_effort', label: 'It lowers the mental effort to get started' },
  { value: 'personalize', label: 'It helps me personalize without overthinking' },
  { value: 'strong_opening', label: "It gives me a strong opening I wouldn't write myself" },
  { value: 'frame_story', label: 'It helps me frame my story clearly' },
  { value: 'natural_ask', label: 'It makes the ask feel more natural' },
];

// Q4: What would you change before sending?
const CHANGE_OPTIONS = [
  { value: 'nothing', label: "Nothing — I'd send it as-is" },
  { value: 'opening', label: 'Change the opening' },
  { value: 'more_specific', label: 'Make it more specific' },
  { value: 'tone', label: 'Adjust the tone' },
  { value: 'ask', label: 'Change the ask' },
  { value: 'shorten', label: 'Shorten it' },
  { value: 'sound_like_me', label: 'Make it sound more like me' },
  { value: 'wouldnt_send', label: "I wouldn't send this even with changes" },
];

// Q6: Most useful part
const USEFUL_PART_OPTIONS = [
  { value: 'research', label: 'Researching the recipient for me' },
  { value: 'structure', label: 'The structure of the cold email' },
  { value: 'connection', label: 'How it connected my story to the recipient' },
  { value: 'ask_framing', label: 'The way it framed the ask' },
  { value: 'flow', label: 'The overall flow showing how a good cold email should be written' },
  { value: 'none', label: 'None of the above' },
];

const SESSION_STORAGE_KEY = 'prolific_session_id';

export default function ProlificSurvey() {
  const navigate = useNavigate();
  const { data, setCurrentStep, setGeneratedEmail, generatedEmail } = useProlific();
  const { toast } = useToast();
  
  // Completion dialog state
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  
  // Q1
  const [comparisonRating, setComparisonRating] = useState('');
  // Q2
  const [likelihoodChange, setLikelihoodChange] = useState('');
  // Q3 - up to 2 selections
  const [likelihoodReasons, setLikelihoodReasons] = useState<string[]>([]);
  const [likelihoodOther, setLikelihoodOther] = useState('');
  // Q4 - multiple selections
  const [changesBeforeSending, setChangesBeforeSending] = useState<string[]>([]);
  // Q5
  const [whatFeltOff, setWhatFeltOff] = useState('');
  // Q6
  const [mostUsefulPart, setMostUsefulPart] = useState('');
  // Q7
  const [whatsMissing, setWhatsMissing] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setCurrentStep(4);
    if (!data.prolificId) {
      navigate('/prolific');
    }
  }, [data.prolificId, navigate, setCurrentStep]);

  const showQ3 = likelihoodChange === 'significantly_more' || likelihoodChange === 'somewhat_more';
  
  const isValid = comparisonRating && likelihoodChange && changesBeforeSending.length > 0 && mostUsefulPart;

  const handleLikelihoodReasonToggle = (value: string) => {
    setLikelihoodReasons(prev => {
      if (prev.includes(value)) {
        return prev.filter(v => v !== value);
      }
      if (prev.length >= 2) {
        return prev;
      }
      return [...prev, value];
    });
  };

  const handleChangeToggle = (value: string) => {
    setChangesBeforeSending(prev => {
      if (prev.includes(value)) {
        return prev.filter(v => v !== value);
      }
      // If selecting "nothing" or "wouldnt_send", clear others
      if (value === 'nothing' || value === 'wouldnt_send') {
        return [value];
      }
      // If selecting something else, remove "nothing" and "wouldnt_send"
      const filtered = prev.filter(v => v !== 'nothing' && v !== 'wouldnt_send');
      return [...filtered, value];
    });
  };

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;

    const sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) {
      toast({
        title: 'Session Error',
        description: 'Session not found. Please restart the study.',
        variant: 'destructive',
      });
      navigate('/prolific');
      return;
    }

    setIsSubmitting(true);
    try {
      // Build likelihood reasons with "other" if provided
      const finalLikelihoodReasons = showQ3 
        ? [...likelihoodReasons, ...(likelihoodOther.trim() ? [`other: ${likelihoodOther.trim()}`] : [])]
        : null;

      const { error } = await supabase.functions.invoke('submit-prolific-survey', {
        body: {
          sessionId,
          comparisonRating: parseInt(comparisonRating, 10),
          likelihoodChange,
          likelihoodReasons: finalLikelihoodReasons,
          changesBeforeSending,
          whatFeltOff: whatFeltOff.trim() || null,
          mostUsefulPart,
          whatsMissing: whatsMissing.trim() || null,
        },
      });

      if (error) throw error;

      localStorage.removeItem(SESSION_STORAGE_KEY);
      setGeneratedEmail(null);
      
      // If user came from Prolific (auto-captured), show completion code dialog
      if (data.wasAutoCaptured) {
        setShowCompletionDialog(true);
      } else {
        navigate('/prolific/complete');
      }
    } catch (error) {
      console.error('Error submitting survey:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit survey. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(PROLIFIC_COMPLETION_CODE);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Please copy the code manually.',
        variant: 'destructive',
      });
    }
  };

  const handleProlificRedirect = () => {
    window.location.href = PROLIFIC_COMPLETION_URL;
  };

  const handleBack = () => {
    navigate('/prolific/read');
  };

  return (
    <ProlificLayout>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left side: Generated email */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Generated Email</h2>
          {generatedEmail ? (
            <div className="bg-card border border-border rounded-sm p-6 space-y-4 sticky top-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Subject</p>
                <p className="font-medium text-foreground">{generatedEmail.subject}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Body</p>
                <div className="whitespace-pre-wrap text-foreground text-sm leading-relaxed">
                  {generatedEmail.body}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-sm p-6 text-muted-foreground">
              No email generated yet.
            </div>
          )}
        </div>

        {/* Right side: Survey questions */}
        <div className="space-y-8">
          <div className="text-center space-y-3 lg:text-left">
            <h1 className="text-3xl font-serif font-semibold text-foreground">
              Your Feedback
            </h1>
            <p className="text-muted-foreground">
              Please share your thoughts on the generated email.
            </p>
          </div>

          <div className="bg-card border border-border rounded-sm p-6 space-y-8">
            {/* Q1: Comparison */}
            <div className="space-y-4">
              <Label className="text-base font-medium">
                Q1. Compared to cold emails you usually write, how was this email?
              </Label>
              <RadioGroup
                value={comparisonRating}
                onValueChange={setComparisonRating}
                className="space-y-2"
              >
                {COMPARISON_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-center space-x-3">
                    <RadioGroupItem value={option.value} id={`comparison-${option.value}`} />
                    <Label
                      htmlFor={`comparison-${option.value}`}
                      className="font-normal cursor-pointer"
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Q2: Likelihood change */}
            <div className="space-y-4">
              <Label className="text-base font-medium">
                Q2. Would using a tool like this make you more likely to send cold emails?
              </Label>
              <RadioGroup
                value={likelihoodChange}
                onValueChange={setLikelihoodChange}
                className="space-y-2"
              >
                {LIKELIHOOD_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-center space-x-3">
                    <RadioGroupItem value={option.value} id={`likelihood-${option.value}`} />
                    <Label
                      htmlFor={`likelihood-${option.value}`}
                      className="font-normal cursor-pointer"
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Q3: Why more likely (conditional) */}
            {showQ3 && (
              <div className="space-y-4 border-l-2 border-primary/30 pl-4">
                <Label className="text-base font-medium">
                  Q3. Why would this make you more likely to send cold emails?
                  <span className="text-muted-foreground font-normal ml-1">(Select up to 2)</span>
                </Label>
                <div className="space-y-2">
                  {LIKELIHOOD_REASONS.map((option) => (
                    <div key={option.value} className="flex items-center space-x-3">
                      <Checkbox
                        id={`reason-${option.value}`}
                        checked={likelihoodReasons.includes(option.value)}
                        onCheckedChange={() => handleLikelihoodReasonToggle(option.value)}
                        disabled={likelihoodReasons.length >= 2 && !likelihoodReasons.includes(option.value)}
                      />
                      <Label
                        htmlFor={`reason-${option.value}`}
                        className="font-normal cursor-pointer"
                      >
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </div>
                <div className="pt-2">
                  <Label htmlFor="reason-other" className="text-sm text-muted-foreground">
                    Other (optional)
                  </Label>
                  <Textarea
                    id="reason-other"
                    value={likelihoodOther}
                    onChange={(e) => setLikelihoodOther(e.target.value)}
                    placeholder="Any other reason..."
                    rows={2}
                    maxLength={500}
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            {/* Q4: Changes before sending */}
            <div className="space-y-4">
              <Label className="text-base font-medium">
                Q4. What would you change before sending this email?
                <span className="text-muted-foreground font-normal ml-1">(Select all that apply)</span>
              </Label>
              <div className="space-y-2">
                {CHANGE_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-center space-x-3">
                    <Checkbox
                      id={`change-${option.value}`}
                      checked={changesBeforeSending.includes(option.value)}
                      onCheckedChange={() => handleChangeToggle(option.value)}
                    />
                    <Label
                      htmlFor={`change-${option.value}`}
                      className="font-normal cursor-pointer"
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Q5: What felt off */}
            <div className="space-y-3">
              <Label htmlFor="what-felt-off" className="text-base font-medium">
                Q5. What, if anything, felt most off or least convincing in this email?
              </Label>
              <Textarea
                id="what-felt-off"
                value={whatFeltOff}
                onChange={(e) => setWhatFeltOff(e.target.value)}
                placeholder='If nothing, say "nothing."'
                rows={3}
                maxLength={2000}
              />
            </div>

            {/* Q6: Most useful part */}
            <div className="space-y-4">
              <Label className="text-base font-medium">
                Q6. What was the most useful part of this cold email writer for you?
                <span className="text-muted-foreground font-normal ml-1">(Choose one)</span>
              </Label>
              <RadioGroup
                value={mostUsefulPart}
                onValueChange={setMostUsefulPart}
                className="space-y-2"
              >
                {USEFUL_PART_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-center space-x-3">
                    <RadioGroupItem value={option.value} id={`useful-${option.value}`} />
                    <Label
                      htmlFor={`useful-${option.value}`}
                      className="font-normal cursor-pointer"
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Q7: What's missing */}
            <div className="space-y-3">
              <Label htmlFor="whats-missing" className="text-base font-medium">
                Q7. If you were to use this tool to write cold emails in the future, what would be missing?
              </Label>
              <Textarea
                id="whats-missing"
                value={whatsMissing}
                onChange={(e) => setWhatsMissing(e.target.value)}
                placeholder="Share your thoughts..."
                rows={3}
                maxLength={2000}
              />
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={handleBack}>
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isValid || isSubmitting}
              size="lg"
              className="min-w-[150px]"
            >
              {isSubmitting ? 'Submitting...' : 'Submit & Finish'}
            </Button>
          </div>
        </div>
      </div>

      {/* Prolific Completion Code Dialog */}
      <Dialog open={showCompletionDialog} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-center text-xl">Study Complete!</DialogTitle>
            <DialogDescription className="text-center">
              Thank you for participating. Copy your completion code below and click Done to return to Prolific.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-center gap-3">
              <div className="bg-muted px-6 py-3 rounded-md font-mono text-2xl font-bold tracking-wider">
                {PROLIFIC_COMPLETION_CODE}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyCode}
                className="shrink-0"
              >
                {codeCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Keep this code safe. You'll need it to complete your submission on Prolific.
            </p>
            <Button
              onClick={handleProlificRedirect}
              className="w-full"
              size="lg"
            >
              Done — Return to Prolific
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ProlificLayout>
  );
}
