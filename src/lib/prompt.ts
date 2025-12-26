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

export interface ResearchedEmailResponse extends EmailResponse {
  researchedFacts?: string[];
}
