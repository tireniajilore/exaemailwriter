import { useEffect } from 'react';
import { ProlificLayout } from '@/components/prolific/ProlificLayout';
import { Button } from '@/components/ui/button';
import { useProlific } from '@/contexts/ProlificContext';
import { CheckCircle, ExternalLink } from 'lucide-react';

export default function ProlificComplete() {
  const { setCurrentStep } = useProlific();

  useEffect(() => {
    setCurrentStep(5);
  }, [setCurrentStep]);

  // Replace with your actual Prolific completion URL
  const completionUrl = 'https://app.prolific.com/submissions/complete?cc=XXXXXXX';

  return (
    <ProlificLayout>
      <div className="space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <CheckCircle className="w-16 h-16 text-green-600" />
          </div>
          <h1 className="text-3xl font-serif font-semibold text-foreground">
            Study Complete
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Thank you for participating in our research study. Your feedback 
            is invaluable in helping us improve AI-powered writing tools.
          </p>
        </div>

        <div className="bg-card border border-border rounded-sm p-6 space-y-6">
          <div className="space-y-4">
            <h2 className="font-serif text-lg font-medium text-center">
              Complete Your Submission
            </h2>
            <p className="text-sm text-muted-foreground text-center">
              Please click the button below to return to Prolific and confirm your submission.
            </p>
          </div>

          <div className="flex justify-center">
            <Button asChild size="lg" className="min-w-[250px]">
              <a href={completionUrl} target="_blank" rel="noopener noreferrer">
                Return to Prolific
                <ExternalLink className="w-4 h-4 ml-2" />
              </a>
            </Button>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground text-center">
              If the button doesn't work, copy this completion code: <code className="bg-muted px-1.5 py-0.5 rounded">XXXXXXX</code>
            </p>
          </div>
        </div>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Questions? Contact us at <span className="text-foreground">research@example.com</span>
          </p>
        </div>
      </div>
    </ProlificLayout>
  );
}
