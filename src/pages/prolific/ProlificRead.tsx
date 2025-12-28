import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProlificLayout } from '@/components/prolific/ProlificLayout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useProlific } from '@/contexts/ProlificContext';

export default function ProlificRead() {
  const navigate = useNavigate();
  const { data, setCurrentStep, generatedEmail } = useProlific();
  const [hasConfirmed, setHasConfirmed] = useState(false);

  useEffect(() => {
    setCurrentStep(3);
    if (!data.prolificId) {
      navigate('/prolific');
    }
    if (!generatedEmail) {
      navigate('/prolific/app');
    }
  }, [data.prolificId, generatedEmail, navigate, setCurrentStep]);

  const handleContinue = () => {
    navigate('/prolific/survey');
  };

  const handleBack = () => {
    navigate('/prolific/app');
  };

  if (!generatedEmail) {
    return null;
  }

  return (
    <ProlificLayout>
      <div className="space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-serif font-semibold text-foreground">
            Review the Generated Email
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Please read the email below carefully. Imagine whether you would actually send it.
          </p>
        </div>

        {/* Generated Email Display */}
        <div className="bg-card border border-border rounded-sm p-6 space-y-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Subject</p>
            <p className="font-medium text-foreground">{generatedEmail.subject}</p>
          </div>
          <div className="border-t border-border pt-4 space-y-1">
            <p className="text-sm text-muted-foreground">Body</p>
            <div className="whitespace-pre-wrap text-foreground leading-relaxed">
              {generatedEmail.body}
            </div>
          </div>
        </div>

        {/* Evaluation prompts */}
        <div className="bg-muted/30 border border-border rounded-sm p-6 space-y-6">
          <div className="space-y-4">
            <h2 className="font-serif text-lg font-medium">As you read, consider:</h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <span>Does the email reference specific, accurate details about the recipient?</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <span>Does it sound like something you would write?</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <span>Would you feel comfortable sending this email as-is?</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <span>How does this compare to cold emails you usually write?</span>
              </li>
            </ul>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="confirm-read"
                checked={hasConfirmed}
                onCheckedChange={(checked) => setHasConfirmed(checked === true)}
              />
              <Label 
                htmlFor="confirm-read" 
                className="text-sm font-normal cursor-pointer leading-relaxed"
              >
                I have read the email and considered whether I would send it.
              </Label>
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={handleBack}>
            Back to Email
          </Button>
          <Button 
            onClick={handleContinue} 
            disabled={!hasConfirmed}
            size="lg" 
            className="min-w-[150px]"
          >
            Continue to Survey
          </Button>
        </div>
      </div>
    </ProlificLayout>
  );
}
