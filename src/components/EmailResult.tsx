import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy } from 'lucide-react';
import type { EmailResponse } from '@/lib/prompt';

interface EmailResultProps {
  result: EmailResponse;
}

export function EmailResult({ result }: EmailResultProps) {
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);
  const subjectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const bodyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (subjectTimeoutRef.current) {
        clearTimeout(subjectTimeoutRef.current);
      }
      if (bodyTimeoutRef.current) {
        clearTimeout(bodyTimeoutRef.current);
      }
    };
  }, []);

  const copyToClipboard = async (text: string, type: 'subject' | 'body') => {
    await navigator.clipboard.writeText(text);
    if (type === 'subject') {
      setCopiedSubject(true);

      // Clear existing timeout if any
      if (subjectTimeoutRef.current) {
        clearTimeout(subjectTimeoutRef.current);
      }

      subjectTimeoutRef.current = setTimeout(() => setCopiedSubject(false), 2000);
    } else {
      setCopiedBody(true);

      // Clear existing timeout if any
      if (bodyTimeoutRef.current) {
        clearTimeout(bodyTimeoutRef.current);
      }

      bodyTimeoutRef.current = setTimeout(() => setCopiedBody(false), 2000);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <h2 className="font-serif text-2xl font-medium">Your Generated Email</h2>

      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Subject Line
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(result.subject, 'subject')}
              className="h-8 px-2 text-xs rounded-none"
            >
              {copiedSubject ? (
                <>
                  <Check className="mr-1 h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3 w-3" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <div className="border-l-2 border-foreground pl-4 py-2 font-serif text-lg">
            {result.subject}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Email Body
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(result.body, 'body')}
              className="h-8 px-2 text-xs rounded-none"
            >
              {copiedBody ? (
                <>
                  <Check className="mr-1 h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3 w-3" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <div className="bg-secondary/50 border border-border p-6 whitespace-pre-wrap text-base leading-relaxed font-body">
            {result.body}
          </div>
        </div>
      </div>
    </div>
  );
}
