import { Check, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Stage } from '@/hooks/useEmailGenerationProgress';

export type StageStatus = 'pending' | 'current' | 'completed';

interface StageIndicatorProps {
  stage: Stage;
  status: StageStatus;
}

export function StageIndicator({ stage, status }: StageIndicatorProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 text-sm transition-opacity duration-300',
        status === 'pending' && 'opacity-40',
        status === 'current' && 'opacity-100',
        status === 'completed' && 'opacity-60'
      )}
    >
      {status === 'completed' && (
        <Check className="h-4 w-4 text-foreground shrink-0" />
      )}
      {status === 'current' && (
        <Loader2 className="h-4 w-4 animate-spin text-foreground shrink-0" />
      )}
      {status === 'pending' && (
        <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      <span
        className={cn(
          'font-body',
          status === 'current' && 'font-medium text-foreground',
          status === 'completed' && 'text-muted-foreground',
          status === 'pending' && 'text-muted-foreground'
        )}
      >
        {stage.label}
      </span>
    </div>
  );
}
