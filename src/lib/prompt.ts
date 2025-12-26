export type AskType = 'chat' | 'feedback' | 'referral' | 'job' | 'other';

export type SharedAffiliationType = 
  | 'none'
  | 'school'
  | 'business_school'
  | 'company'
  | 'accelerator'
  | 'personal_characteristics'
  | 'other';

export interface SharedAffiliation {
  types: SharedAffiliationType[];
  name: string;
  detail?: string;
}

export interface EmailRequest {
  // Recipient info
  recipientName: string;
  recipientCompany: string;
  recipientRole: string;
  recipientLink: string;
  
  // Purpose
  askType: AskType;
  reachingOutBecause: string;
  
  // Credibility
  credibilityStory: string;
  
  // Shared affiliation (optional)
  sharedAffiliation?: SharedAffiliation;
}

export interface EmailResponse {
  subject: string;
  body: string;
}

// V2 Hook Fact structure
export interface HookFact {
  claim: string;
  source_url: string;
  evidence_quote: string;
  why_relevant: string;
  bridge_type: 'intent' | 'credibility' | 'curiosity';
  hook_score: number;
}

// V2 Exa Result structure
export interface ExaResult {
  url: string;
  title: string;
  snippet: string;
}

// V2 Enforcement Results
export interface EnforcementResults {
  did_retry: boolean;
  failures_first_pass: string[];
  failures_retry: string[];
}

// V2 Extended Response
export interface ResearchedEmailResponse extends EmailResponse {
  // Research data (V2)
  exaQueries?: string[];
  exaResults?: ExaResult[];
  selectedSources?: string[];
  hookFacts?: HookFact[];
  
  // Legacy compatibility
  researchedFacts?: string[];
  
  // Enforcement
  enforcementResults?: EnforcementResults;
  
  // Validation
  validatorPassed?: boolean;
  validatorErrors?: string[] | null;
  
  // Metrics
  likeYouCount?: number;
  wordCount?: number;
  clicheCount?: number;
  retryUsed?: boolean;
}
