import type { IntentFormData } from '@/components/IntentForm';

export type WizardStep = 1 | 2 | 3 | 4;
export type ResearchPhase = 'pending' | 'active' | 'complete';

export interface WizardState {
  currentStep: WizardStep;
  researchPhase: ResearchPhase;
  intentData: IntentFormData | null;
  requestId: string | null;
  selectedHook: any | null; // Will be typed properly when we have the hook interface
  credibilityStory: string;
}

export const WIZARD_STEPS = [
  { number: 1, label: 'Intent' },
  { number: 2, label: 'Research' },
  { number: 3, label: 'Your Story' },
  { number: 4, label: 'Email' },
] as const;
