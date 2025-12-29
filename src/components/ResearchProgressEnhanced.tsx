import { Check, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ResearchProgressProps {
  recipientName: string;
  recipientCompany: string;
  status: string;
  phaseLabel: string;
  progress: { phase: number; total: number; label?: string };
  counts: { urls: number; hooks: number; hypotheses: number };
  elapsedTime?: number;
}

interface PhaseCardProps {
  icon: 'completed' | 'active' | 'pending';
  label: string;
  description: string;
}

function PhaseCard({ icon, label, description }: PhaseCardProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded border transition-all',
        icon === 'completed' && 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900',
        icon === 'active' && 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900',
        icon === 'pending' && 'bg-muted/30 border-border'
      )}
    >
      {icon === 'completed' && (
        <Check className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
      )}
      {icon === 'active' && (
        <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
      )}
      {icon === 'pending' && (
        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export function ResearchProgressEnhanced({
  recipientName,
  recipientCompany,
  status,
  phaseLabel,
  progress,
  counts,
  elapsedTime = 0,
}: ResearchProgressProps) {
  const currentPhase = progress.phase || 1;
  const totalPhases = progress.total || 4;
  const progressPercent = (currentPhase / totalPhases) * 100;

  // Determine phase card states
  const identityState = currentPhase > 1 ? 'completed' : currentPhase === 1 ? 'active' : 'pending';
  const discoveryState = currentPhase > 2 ? 'completed' : currentPhase === 2 ? 'active' : 'pending';
  const fetchingState = currentPhase > 3 ? 'completed' : currentPhase === 3 ? 'active' : 'pending';
  const extractingState = currentPhase > 4 ? 'completed' : currentPhase === 4 ? 'active' : 'pending';

  return (
    <div className="space-y-6 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="font-serif text-3xl tracking-tight">
          Researching {recipientName} at {recipientCompany}
        </h2>
        <p className="text-base text-muted-foreground leading-relaxed">
          Finding a few strong angles from public content
        </p>
      </div>

      {/* Overall Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>{phaseLabel}</span>
          <span className="text-muted-foreground">{Math.round(progressPercent)}%</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Phase Cards */}
      <div className="space-y-3">
        <PhaseCard
          icon={identityState}
          label="Confirming identity"
          description={
            identityState === 'completed'
              ? 'Matched the right person.'
              : 'Matching role and background.'
          }
        />

        <PhaseCard
          icon={discoveryState}
          label="Finding sources"
          description={
            discoveryState === 'completed'
              ? 'Found several relevant sources.'
              : 'Looking for interviews, posts, and public writing.'
          }
        />

        <PhaseCard
          icon={fetchingState}
          label="Reading sources"
          description={
            fetchingState === 'completed'
              ? 'Pulled key details.'
              : 'Skimming for specific projects, decisions, and quotes.'
          }
        />

        <PhaseCard
          icon={extractingState}
          label="Extracting hooks"
          description={
            extractingState === 'completed'
              ? 'Hooks are ready.'
              : 'Turning evidence into usable opening angles.'
          }
        />
      </div>

    </div>
  );
}
