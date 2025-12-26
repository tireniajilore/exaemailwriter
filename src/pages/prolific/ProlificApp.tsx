import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProlificLayout } from '@/components/prolific/ProlificLayout';
import { Button } from '@/components/ui/button';
import { useProlific } from '@/contexts/ProlificContext';
import { ResearchEmailForm } from '@/components/ResearchEmailForm';
import { EmailResult } from '@/components/EmailResult';
import { supabase } from '@/integrations/supabase/client';
import type { EmailRequest } from '@/lib/prompt';
import { useToast } from '@/hooks/use-toast';

const SESSION_STORAGE_KEY = 'prolific_session_id';

export default function ProlificApp() {
  const navigate = useNavigate();
  const { data, setCurrentStep, setGeneratedEmail, generatedEmail } = useProlific();
  const { toast } = useToast();
  const [localEmail, setLocalEmail] = useState(generatedEmail);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setCurrentStep(2);
    if (!data.prolificId || !data.profession) {
      navigate('/prolific');
    }
    // Verify session exists
    const sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) {
      navigate('/prolific/setup');
    }
  }, [data, navigate, setCurrentStep]);

  const handleSubmit = async (request: EmailRequest) => {
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

    setIsLoading(true);
    try {
      const { data: responseData, error } = await supabase.functions.invoke('log-email-generation', {
        body: {
          sessionId,
          ...request,
        },
      });

      if (error) throw error;

      const email = {
        subject: responseData.subject,
        body: responseData.body,
      };
      
      setLocalEmail(email);
      setGeneratedEmail(email);
    } catch (error) {
      console.error('Error generating email:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate email. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = () => {
    navigate('/prolific/read');
  };

  return (
    <ProlificLayout>
      <div className="space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-serif font-semibold text-foreground">
            Describe Your Cold Email
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Tell us about a real person you want to email and why. The AI will research 
            public information about them and draft a personalized cold email.
          </p>
        </div>

        <div className="bg-card border border-border rounded-sm p-6">
          <ResearchEmailForm onSubmit={handleSubmit} isLoading={isLoading} />
        </div>

        {localEmail && (
          <div className="bg-card border border-border rounded-sm p-6">
            <EmailResult result={localEmail} />
          </div>
        )}

        {localEmail && (
          <div className="flex justify-center pt-4">
            <Button onClick={handleContinue} size="lg" className="min-w-[200px]">
              Continue to Review
            </Button>
          </div>
        )}
      </div>
    </ProlificLayout>
  );
}
