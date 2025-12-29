import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  number: number;
  label: string;
}

interface StepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4;
  steps: Step[];
}

export function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
  return (
    <div className="w-full py-3 px-4 bg-background border-b border-border sticky top-0 z-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isCompleted = step.number < currentStep;
            const isCurrent = step.number === currentStep;
            const isPending = step.number > currentStep;

            return (
              <div key={step.number} className="flex items-center flex-1">
                {/* Step circle */}
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center font-medium text-xs transition-all',
                      isCompleted && 'bg-primary text-primary-foreground',
                      isCurrent && 'bg-foreground text-background border-2 border-foreground',
                      isPending && 'bg-muted text-muted-foreground border-2 border-border'
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span>{step.number}</span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-xs transition-all',
                      isCurrent && 'text-foreground font-medium',
                      (isCompleted || isPending) && 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </span>
                </div>

                {/* Connecting line (don't show after last step) */}
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-[2px] mx-3 transition-all',
                      isCompleted && 'bg-primary',
                      !isCompleted && 'bg-border'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
