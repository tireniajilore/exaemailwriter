import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Hook {
  id: string;
  title: string;
  hook: string;
  whyItWorks: string;
  confidence: number;
  sources: Array<{ label: string; url: string }>;
}

interface HookPickerProps {
  hooks: Hook[];
  selectedHook: Hook | null;
  onSelectHook: (hook: Hook) => void;
  partial?: boolean;
}

export function HookPicker({ hooks, selectedHook, onSelectHook, partial }: HookPickerProps) {
  if (!hooks || hooks.length === 0) {
    return (
      <div className="space-y-4 py-8">
        <h3 className="font-serif text-xl font-medium">No Hooks Found</h3>
        <p className="text-muted-foreground font-body">
          We couldn't find strong personalization hooks for this recipient. The email will be generated with general information.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-serif text-xl font-medium">Select a Hook</h3>
          {partial && (
            <Badge variant="outline" className="text-amber-600 border-amber-600">
              Partial Research
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground font-body">
          Choose which personalization hook to use in your email
        </p>
      </div>

      <div className="space-y-3">
        {hooks.map((hook) => {
          const isSelected = selectedHook?.id === hook.id;
          const confidencePercent = Math.round(hook.confidence * 100);

          return (
            <Card
              key={hook.id}
              onClick={() => onSelectHook(hook)}
              className={cn(
                'p-4 cursor-pointer transition-all hover:border-foreground',
                isSelected && 'border-foreground bg-muted/30'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Selection indicator */}
                <div
                  className={cn(
                    'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5',
                    isSelected
                      ? 'bg-foreground border-foreground'
                      : 'border-border'
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 text-background" />}
                </div>

                {/* Hook content */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-medium">{hook.title}</h4>
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0',
                        confidencePercent >= 65
                          ? 'text-green-600 border-green-600'
                          : confidencePercent >= 50
                          ? 'text-amber-600 border-amber-600'
                          : 'text-muted-foreground border-border'
                      )}
                    >
                      {confidencePercent}% confidence
                    </Badge>
                  </div>

                  <p className="text-sm text-foreground font-body leading-relaxed">
                    {hook.hook}
                  </p>

                  <p className="text-sm text-muted-foreground font-body italic">
                    Why it works: {hook.whyItWorks}
                  </p>

                  {/* Sources */}
                  {hook.sources && hook.sources.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-2 font-medium">
                        Sources:
                      </p>
                      <div className="space-y-1">
                        {hook.sources.map((source, idx) => (
                          <a
                            key={idx}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs text-blue-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                            {source.label}
                          </a>
                        ))}
                      </div>
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
