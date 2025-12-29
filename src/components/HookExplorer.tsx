import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Hook {
  id: string;
  title: string;
  hook: string;
  whyItWorks: string;
  confidence: number;
  sources: Array<{ label: string; url: string }>;
}

interface HookExplorerProps {
  hooks: Hook[];
  selectedHook: Hook | null;
  onSelectHook: (hook: Hook) => void;
  partial?: boolean;
  fallbackMode?: string;
}

export function HookExplorer({
  hooks,
  selectedHook,
  onSelectHook,
  partial = false,
  fallbackMode = 'normal',
}: HookExplorerProps) {
  // No hooks found case
  if (!hooks || hooks.length === 0) {
    return (
      <div className="space-y-6 py-6 max-w-2xl mx-auto">
        <div className="space-y-2">
          <p className="text-base leading-relaxed">
            We didn't find strong public material to reference directly.
          </p>
          <p className="text-base leading-relaxed">
            We'll draft a polite, relevant email without a specific opening angle.
          </p>
        </div>

        <Button size="lg" className="w-full" onClick={() => onSelectHook({ id: 'no-hook', title: 'No Hook', hook: '', whyItWorks: '', confidence: 0, sources: [] })}>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="font-serif text-3xl tracking-tight">Pick an angle to open with</h2>
        <p className="text-base text-muted-foreground leading-relaxed">
          Choose the idea you want to lead your email with. You can try the others later.
        </p>
      </div>

      {/* Partial Results Banner */}
      {partial && (
        <div className="bg-muted/50 border border-border rounded-lg p-4">
          <p className="text-sm leading-relaxed">
            We found limited public writing, but enough context to write a respectful, low-assumption email.
          </p>
        </div>
      )}

      {/* Hook Cards */}
      <div className="space-y-3">
        {hooks.map((hook, index) => {
          const isSelected = selectedHook?.id === hook.id;
          const confidencePercent = Math.round(hook.confidence * 100);

          return (
            <Card
              key={hook.id}
              onClick={() => onSelectHook(hook)}
              className={cn(
                'p-6 cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-card',
                isSelected && 'border-primary border-2 bg-white',
                // Fade-in animation with stagger
                'animate-in fade-in slide-in-from-bottom-4 duration-500',
                index === 1 && 'animation-delay-200',
                index === 2 && 'animation-delay-400'
              )}
              style={{
                animationDelay: `${index * 200}ms`
              }}
            >
              <div className="flex items-start gap-3">
                {/* Selection indicator */}
                <div
                  className={cn(
                    'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                    isSelected
                      ? 'bg-primary border-primary'
                      : 'border-muted'
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>

                {/* Hook content */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-medium text-base">{hook.title}</h4>

                    {/* Relevance Confidence with Tooltip */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge
                              variant="outline"
                              className="text-xs"
                            >
                              High relevance
                            </Badge>
                            <HelpCircle className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs leading-relaxed">
                            Based on how often this theme appears in public writing.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <p className="text-sm leading-relaxed">
                    {hook.hook}
                  </p>

                  {/* Sources */}
                  {hook.sources && hook.sources.length > 0 && (
                    <div>
                      <a
                        href={hook.sources[0].url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:text-primary/80 hover:underline transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View sources
                      </a>
                    </div>
                  )}

                  {/* Choose This Hook Button (shown when selected) */}
                  {isSelected && (
                    <div className="pt-3">
                      <Button
                        size="lg"
                        className="w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectHook(hook);
                        }}
                      >
                        Use this angle
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
