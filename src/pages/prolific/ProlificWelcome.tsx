import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProlificLayout } from '@/components/prolific/ProlificLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProlific } from '@/contexts/ProlificContext';
import { Check } from 'lucide-react';

export default function ProlificWelcome() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data, updateData, setCurrentStep } = useProlific();
  const [wasAutoCapured, setWasAutoCaptured] = useState(false);

  useEffect(() => {
    setCurrentStep(0);
    // Auto-capture Prolific params from URL if present
    const prolificPid = searchParams.get('PROLIFIC_PID');
    const studyId = searchParams.get('STUDY_ID');
    const sessionId = searchParams.get('SESSION_ID');
    
    const updates: Partial<typeof data> = {};
    if (prolificPid && !data.prolificId) {
      updates.prolificId = prolificPid;
      updates.wasAutoCaptured = true;
      setWasAutoCaptured(true);
    }
    if (studyId && !data.studyId) updates.studyId = studyId;
    if (sessionId && !data.sessionId) updates.sessionId = sessionId;
    
    if (Object.keys(updates).length > 0) {
      updateData(updates);
    }
  }, [searchParams, setCurrentStep]);

  const handleContinue = () => {
    if (data.prolificId.trim()) {
      navigate('/prolific/setup');
    }
  };

  return (
    <ProlificLayout>
      <div className="space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-serif font-semibold text-foreground">
            Welcome to Our Study
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Thank you for participating in this research study. You will be testing an AI-powered 
            email writing tool and providing feedback on your experience.
          </p>
        </div>

        <div className="bg-card border border-border rounded-sm p-6 space-y-6">
          <div className="space-y-4">
            <h2 className="font-serif text-lg font-medium">What to Expect</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">1.</span>
                <span>Brief background questions about your experience</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">2.</span>
                <span>Use the AI tool to generate a cold outreach email</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">3.</span>
                <span>Review the generated email</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">4.</span>
                <span>Complete a short feedback survey</span>
              </li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Estimated time: <span className="font-medium text-foreground">10-15 minutes</span>
            </p>
          </div>

          <div className="border-t border-border pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prolificId">Name / User ID</Label>
              {wasAutoCapured ? (
                <div className="flex items-center gap-2 max-w-sm">
                  <div className="flex-1 px-3 py-2 bg-muted/50 border border-border rounded-md text-sm text-foreground">
                    {data.prolificId}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-green-600">
                    <Check className="h-4 w-4" />
                    <span>Auto-captured</span>
                  </div>
                </div>
              ) : (
                <>
                  <Input
                    id="prolificId"
                    value={data.prolificId}
                    onChange={(e) => updateData({ prolificId: e.target.value })}
                    placeholder="Enter your name or user ID"
                    className="max-w-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    If you came from Prolific, this should be auto-filled. Otherwise, please enter it manually.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <Button
            onClick={handleContinue}
            disabled={!data.prolificId.trim()}
            size="lg"
            className="min-w-[200px]"
          >
            Begin Study
          </Button>
        </div>
      </div>
    </ProlificLayout>
  );
}
