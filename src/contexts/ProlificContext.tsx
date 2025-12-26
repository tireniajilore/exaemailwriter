import { createContext, useContext, useState, ReactNode } from 'react';
import type { EmailResponse } from '@/lib/prompt';

interface ProlificData {
  prolificId: string;
  studyId: string;
  sessionId: string;
  profession: string;
  coldEmailFrequency: string;
  wasAutoCaptured: boolean;
}

interface ProlificContextType {
  data: ProlificData;
  updateData: (updates: Partial<ProlificData>) => void;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  generatedEmail: EmailResponse | null;
  setGeneratedEmail: (email: EmailResponse | null) => void;
}

const ProlificContext = createContext<ProlificContextType | undefined>(undefined);

const STEPS = [
  { path: '/prolific', label: 'Welcome' },
  { path: '/prolific/setup', label: 'Setup' },
  { path: '/prolific/app', label: 'Task' },
  { path: '/prolific/read', label: 'Review' },
  { path: '/prolific/survey', label: 'Feedback' },
  { path: '/prolific/complete', label: 'Complete' },
];

export const PROLIFIC_STEPS = STEPS;

export function ProlificProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ProlificData>({
    prolificId: '',
    studyId: '',
    sessionId: '',
    profession: '',
    coldEmailFrequency: '',
    wasAutoCaptured: false,
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [generatedEmail, setGeneratedEmail] = useState<EmailResponse | null>(null);

  const updateData = (updates: Partial<ProlificData>) => {
    setData(prev => ({ ...prev, ...updates }));
  };

  return (
    <ProlificContext.Provider value={{ 
      data, 
      updateData, 
      currentStep, 
      setCurrentStep,
      generatedEmail,
      setGeneratedEmail,
    }}>
      {children}
    </ProlificContext.Provider>
  );
}

export function useProlific() {
  const context = useContext(ProlificContext);
  if (!context) {
    throw new Error('useProlific must be used within a ProlificProvider');
  }
  return context;
}
