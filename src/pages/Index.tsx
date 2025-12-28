import { useState } from 'react';
import { ResearchEmailForm } from '@/components/ResearchEmailForm';
import { EmailResult } from '@/components/EmailResult';
import { apiRequest } from '@/lib/api';
import type { EmailRequest, EmailResponse } from '@/lib/prompt';
import { toast } from 'sonner';

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<EmailResponse | null>(null);

  const handleSubmit = async (request: EmailRequest) => {
    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await apiRequest<{ subject: string; body: string; error?: string }>(
        '/api/generate-email',
        request
      );

      if (error) {
        console.error('API error:', error);
        toast.error('Failed to generate email. Please try again.');
        return;
      }

      if (data?.error) {
        console.error('API error:', data.error);
        toast.error(data.error);
        return;
      }

      if (data) {
        setResult({
          subject: data.subject,
          body: data.body,
        });
      }
    } catch (err) {
      console.error('Error generating email:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
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

        {/* Results */}
        {result && (
          <div className="mt-12 border-t border-foreground pt-8">
            <EmailResult result={result} />
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
