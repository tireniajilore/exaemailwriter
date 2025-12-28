import { ReactNode } from 'react';
import { PROLIFIC_STEPS, useProlific } from '@/contexts/ProlificContext';
import { Check } from 'lucide-react';

interface ProlificLayoutProps {
  children: ReactNode;
}

export function ProlificLayout({ children }: ProlificLayoutProps) {
  const { currentStep } = useProlific();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Research Study</span>
            <span className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {PROLIFIC_STEPS.length}
            </span>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {PROLIFIC_STEPS.map((step, index) => (
              <div key={step.path} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`
                      w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                      transition-colors duration-200
                      ${index < currentStep
                        ? 'bg-primary text-primary-foreground'
                        : index === currentStep
                          ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background'
                          : 'bg-muted text-muted-foreground'
                      }
                    `}
                  >
                    {index < currentStep ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span
                    className={`
                      mt-1.5 text-xs hidden sm:block
                      ${index <= currentStep ? 'text-foreground' : 'text-muted-foreground'}
                    `}
                  >
                    {step.label}
                  </span>
                </div>
                {index < PROLIFIC_STEPS.length - 1 && (
                  <div
                    className={`
                      w-8 sm:w-12 lg:w-16 h-0.5 mx-1 sm:mx-2
                      ${index < currentStep ? 'bg-primary' : 'bg-muted'}
                    `}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-10">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <p className="text-xs text-muted-foreground text-center">
            Your responses are confidential and will only be used for research purposes.
          </p>
        </div>
      </footer>
    </div>
  );
}
