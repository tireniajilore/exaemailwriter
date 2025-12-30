import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check } from 'lucide-react';
import type { EmailResponse } from '@/lib/prompt';

interface Hook {
  id: string;
  title: string;
  hook: string;
  whyItWorks: string;
  confidence: number;
  sources: Array<{ label: string; url: string }>;
}

interface EmailPreviewProps {
  result: EmailResponse;
  selectedHook: Hook | null;
  availableHooks: Hook[];
  onTryDifferentHook: (hook: Hook) => void;
  onEditCredibility: () => void;
  onStartOver: () => void;
}

export function EmailPreview({
  result,
  selectedHook,
}: EmailPreviewProps) {
  const [copiedBody, setCopiedBody] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const copyToClipboard = async (text: string, type: 'subject' | 'body') => {
    await navigator.clipboard.writeText(text);
    setCopiedBody(true);

    // Clear existing timeout if any
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }

    copyTimeoutRef.current = setTimeout(() => setCopiedBody(false), 2000);
  };

  return (
    <div className="space-y-6 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="font-serif text-3xl tracking-tight">Your email</h2>
        <p className="text-base text-muted-foreground leading-relaxed">
          Short, specific, and grounded in real context.
        </p>
      </div>

      {/* Quality Hints */}
      <div className="space-y-2">
        <ul className="text-sm text-muted-foreground leading-relaxed space-y-1.5">
          {selectedHook && selectedHook.id !== 'no-hook' && (
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <span>Opens with a shared idea</span>
            </li>
          )}
          {selectedHook && selectedHook.id !== 'no-hook' && (
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <span>References {selectedHook.title.split(' ')[0]}'s work</span>
            </li>
          )}
          <li className="flex items-start gap-2">
            <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <span>Keeps the ask small</span>
          </li>
        </ul>
      </div>

      {/* Email Content */}
      <Card className="p-6 bg-secondary/30 border-border">
        <div className="space-y-6">
          {/* Subject */}
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Subject</div>
            <div className="text-base font-medium leading-relaxed">
              {result.subject}
            </div>
          </div>

          {/* Body */}
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Body</div>
            <div className="whitespace-pre-wrap text-base leading-relaxed">
              {result.body}
            </div>
          </div>
        </div>
      </Card>

      {/* Copy Button */}
      <div>
        <Button
          size="lg"
          className="w-full"
          onClick={() => copyToClipboard(result.subject + '\n\n' + result.body, 'body')}
        >
          {copiedBody ? 'Copied' : 'Copy email'}
        </Button>
      </div>
    </div>
  );
}
