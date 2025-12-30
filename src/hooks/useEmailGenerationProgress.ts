import { useState, useEffect, useMemo } from 'react';

export interface Stage {
  id: string;
  label: string;
  description: string;
  estimatedDuration: number; // milliseconds
  tips?: string[];
}

export const GENERATION_STAGES: Stage[] = [
  {
    id: 'identity',
    label: 'Confirming identity',
    description: 'Searching for {recipientName} at {recipientCompany}',
    estimatedDuration: 10000,
    tips: ['We verify the recipient exists before researching', 'This prevents wasted effort on incorrect names']
  },
  {
    id: 'scan',
    label: 'Scanning public sources',
    description: 'LinkedIn, interviews, articles, podcasts',
    estimatedDuration: 10000,
    tips: ['Looking across 10+ public data sources', 'We prioritize recent content (last 2 years)']
  },
  {
    id: 'research',
    label: 'Finding specific hooks',
    description: 'Looking for quotes, projects, and insights',
    estimatedDuration: 30000,
    tips: [
      'Best emails reference specific facts, not generic achievements',
      'We look for named projects, quotes, and decisions',
      'This is the most time-intensive step'
    ]
  },
  {
    id: 'synthesis',
    label: 'Analyzing research findings',
    description: 'Extracting 2-3 personalization hooks',
    estimatedDuration: 20000,
    tips: ['Scoring each finding by relevance to your purpose', 'Only the top 2 hooks make it into your email']
  },
  {
    id: 'drafting',
    label: 'Drafting your email',
    description: 'Writing "Like you," connection',
    estimatedDuration: 15000,
    tips: ['Creating a natural bridge between your story and theirs', 'Aiming for 80-120 words (readable in 20 seconds)']
  },
  {
    id: 'polish',
    label: 'Polishing the final draft',
    description: 'Checking tone and format',
    estimatedDuration: 5000,
    tips: ['Validating against 15+ quality rules', 'Ensuring "Like you," appears exactly once']
  }
];

const TOTAL_ESTIMATED_DURATION = GENERATION_STAGES.reduce((sum, stage) => sum + stage.estimatedDuration, 0);

function getProgressMultiplier(stageIndex: number, stageProgressPercent: number): number {
  // Speed up early stages (builds confidence)
  if (stageIndex <= 1) return 1.3;

  // Slow down Stage 2 (research: 20-50s) but show continuous movement
  if (stageIndex === 2) {
    // Faster in first 30% and last 20% of stage
    if (stageProgressPercent < 30 || stageProgressPercent > 80) return 1.1;
    return 0.8; // Slower in middle, but still moving
  }

  // Speed up final stages (creates anticipation)
  if (stageIndex >= 4) return 1.4;

  return 1.0;
}

export function useEmailGenerationProgress() {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  // Timer - increments every 100ms
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime((prev) => prev + 100);
    }, 100);

    return () => clearInterval(timer);
  }, []);

  // Calculate which stage we're in based on elapsed time
  const { currentStageIndex, stageStartTime } = useMemo(() => {
    let cumulativeTime = 0;
    let adjustedElapsed = elapsedTime;

    // Apply multipliers retroactively
    for (let i = 0; i < GENERATION_STAGES.length; i++) {
      const stage = GENERATION_STAGES[i];
      const multiplier = getProgressMultiplier(i, 50); // Use mid-point multiplier for calculation
      const adjustedDuration = stage.estimatedDuration / multiplier;

      if (adjustedElapsed < adjustedDuration) {
        return {
          currentStageIndex: i,
          stageStartTime: cumulativeTime
        };
      }

      cumulativeTime += stage.estimatedDuration;
      adjustedElapsed -= adjustedDuration;
    }

    // If we've exceeded all stages, stay on last stage
    return {
      currentStageIndex: GENERATION_STAGES.length - 1,
      stageStartTime: TOTAL_ESTIMATED_DURATION - GENERATION_STAGES[GENERATION_STAGES.length - 1].estimatedDuration
    };
  }, [elapsedTime]);

  const currentStage = GENERATION_STAGES[currentStageIndex];

  // Calculate progress within current stage
  const stageProgress = useMemo(() => {
    const stageElapsed = elapsedTime - stageStartTime;
    const multiplier = getProgressMultiplier(currentStageIndex, 50);
    const adjustedDuration = currentStage.estimatedDuration / multiplier;
    const progress = Math.min((stageElapsed / adjustedDuration) * 100, 100);
    return progress;
  }, [elapsedTime, stageStartTime, currentStage.estimatedDuration, currentStageIndex]);

  // Calculate total progress (capped at 99% until real completion)
  const totalProgress = useMemo(() => {
    let cumulativeProgress = 0;

    for (let i = 0; i < currentStageIndex; i++) {
      const weight = GENERATION_STAGES[i].estimatedDuration / TOTAL_ESTIMATED_DURATION;
      cumulativeProgress += weight * 100;
    }

    const currentWeight = currentStage.estimatedDuration / TOTAL_ESTIMATED_DURATION;
    cumulativeProgress += (stageProgress / 100) * currentWeight * 100;

    // Cap at 99% to avoid showing 100% before actual completion
    return Math.min(cumulativeProgress, 99);
  }, [currentStageIndex, currentStage.estimatedDuration, stageProgress]);

  // Rotate tips for current stage
  useEffect(() => {
    if (!currentStage.tips || currentStage.tips.length <= 1) return;

    // Capture tips length to avoid stale closure issues
    const tipsLength = currentStage.tips.length;

    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % tipsLength);
    }, 8000); // Change tip every 8 seconds

    return () => clearInterval(interval);
  }, [currentStage.id]); // Only depend on stage ID, not tips array reference

  // Reset tip index when stage changes
  useEffect(() => {
    setCurrentTipIndex(0);
  }, [currentStage.id]);

  const currentTip = currentStage.tips?.[currentTipIndex];

  return {
    currentStage,
    currentStageIndex,
    stageProgress,
    totalProgress,
    elapsedTime,
    currentTip,
    currentTipIndex,
    allStages: GENERATION_STAGES
  };
}
