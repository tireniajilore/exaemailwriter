import { AlertCircle, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useEmailGenerationProgress } from '@/hooks/useEmailGenerationProgress';
import { StageIndicator, type StageStatus } from '@/components/StageIndicator';
import { TipsCarousel } from '@/components/TipsCarousel';

interface GenerationProgressProps {
  recipientName: string;
  recipientCompany: string;
}

function interpolateDescription(
  description: string,
  values: { recipientName: string; recipientCompany: string }
): string {
  return description
    .replace('{recipientName}', values.recipientName)
    .replace('{recipientCompany}', values.recipientCompany);
}

function getStageStatus(stageIndex: number, currentStageIndex: number): StageStatus {
  if (stageIndex < currentStageIndex) return 'completed';
  if (stageIndex === currentStageIndex) return 'current';
  return 'pending';
}

export function GenerationProgress({
  recipientName,
  recipientCompany
}: GenerationProgressProps) {
  const {
    currentStage,
    currentStageIndex,
    totalProgress,
    elapsedTime,
    currentTip,
    currentTipIndex,
    allStages
  } = useEmailGenerationProgress();

  const showTimeoutWarning = elapsedTime > 90000;

  return (
    <div className="space-y-6 py-8">
      {/* Overall Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm font-body">
          <span className="font-medium">Generation Progress</span>
          <span className="text-muted-foreground">{Math.round(totalProgress)}%</span>
        </div>
        <Progress value={totalProgress} className="h-2" />
      </div>

      {/* Current Stage */}
      <div className="border-l-2 border-foreground pl-6 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-foreground" />
          <h3 className="font-serif text-xl font-medium">
            {currentStage.label}
          </h3>
        </div>
        <p className="text-muted-foreground font-body">
          {interpolateDescription(currentStage.description, {
            recipientName,
            recipientCompany
          })}
        </p>
      </div>

      {/* Educational Tips (when available for current stage) */}
      {currentStage.tips && currentStage.tips.length > 0 && (
        <TipsCarousel tips={currentStage.tips} currentTipIndex={currentTipIndex} />
      )}

      {/* Timeout Warning */}
      {showTimeoutWarning && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="font-medium text-amber-900 dark:text-amber-400 text-sm">
                Taking longer than expected
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-500 font-body">
                Deep research in progress. We're finding the best possible hooks for your email.
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-500 font-body">
                You can wait a bit longer, or we'll use what we've found so far.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stage Timeline */}
      <div className="space-y-2 pt-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-body mb-3">
          All Stages
        </p>
        {allStages.map((stage, index) => (
          <StageIndicator
            key={stage.id}
            stage={stage}
            status={getStageStatus(index, currentStageIndex)}
          />
        ))}
      </div>

      {/* Time Elapsed Indicator */}
      {elapsedTime > 60000 && !showTimeoutWarning && (
        <div className="text-xs text-muted-foreground text-center font-body pt-2">
          <p>Deep research in progress...</p>
          <p>This typically takes 60-90 seconds for best results</p>
        </div>
      )}
    </div>
  );
}
