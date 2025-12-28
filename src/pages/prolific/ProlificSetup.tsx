import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProlificLayout } from '@/components/prolific/ProlificLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useProlific } from '@/contexts/ProlificContext';
import { apiRequest } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

const FREQUENCY_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'rarely', label: 'Rarely (a few per year)' },
  { value: 'occasionally', label: 'Occasionally (a few per month)' },
  { value: 'regularly', label: 'Regularly (weekly)' },
  { value: 'frequently', label: 'Frequently (daily)' },
];

const SESSION_STORAGE_KEY = 'prolific_session_id';

export default function ProlificSetup() {
  const navigate = useNavigate();
  const { data, updateData, setCurrentStep } = useProlific();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setCurrentStep(1);
    // Redirect if no prolific ID
    if (!data.prolificId) {
      navigate('/prolific');
    }
  }, [data.prolificId, navigate, setCurrentStep]);

  const isValid = data.profession.trim() && data.coldEmailFrequency;

  const handleContinue = async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { data: responseData, error } = await apiRequest<{ sessionId: string }>('/api/prolific/session', {
        prolificId: data.prolificId,
        studyId: data.studyId,
        prolificSessionId: data.sessionId,
        profession: data.profession,
        coldEmailFrequency: data.coldEmailFrequency,
      });

      if (error) throw new Error(error);

      if (!responseData?.sessionId) {
        throw new Error('No session ID returned');
      }

      localStorage.setItem(SESSION_STORAGE_KEY, responseData.sessionId);
      
      navigate('/prolific/app');
    } catch (error) {
      console.error('Error creating session:', error);
      toast({
        title: 'Error',
        description: 'Failed to start session. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    navigate('/prolific');
  };

  return (
    <ProlificLayout>
      <div className="space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-serif font-semibold text-foreground">
            About You
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Please tell us a bit about your background. This helps us understand 
            how different people use email outreach tools.
          </p>
        </div>

        <div className="bg-card border border-border rounded-sm p-6 space-y-8">
          <div className="space-y-3">
            <Label htmlFor="profession">What is your profession or field of work?</Label>
            <Input
              id="profession"
              value={data.profession}
              onChange={(e) => updateData({ profession: e.target.value })}
              placeholder="e.g., MBA Student, Sales Manager, Recruiter"
              className="max-w-md"
            />
          </div>

          <div className="space-y-4">
            <Label>How often do you write cold outreach emails?</Label>
            <RadioGroup
              value={data.coldEmailFrequency}
              onValueChange={(value) => updateData({ coldEmailFrequency: value })}
              className="space-y-3"
            >
              {FREQUENCY_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-3">
                  <RadioGroupItem value={option.value} id={option.value} />
                  <Label
                    htmlFor={option.value}
                    className="font-normal cursor-pointer"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={handleBack}>
            Back
          </Button>
          <Button
            onClick={handleContinue}
            disabled={!isValid || isSubmitting}
            size="lg"
            className="min-w-[150px]"
          >
            {isSubmitting ? 'Starting...' : 'Continue'}
          </Button>
        </div>
      </div>
    </ProlificLayout>
  );
}
