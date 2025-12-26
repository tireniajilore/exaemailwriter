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

// ============= V2 Hook Pack Types =============

// Bridge angle for "Like you" connections
export type BridgeAngle = 'domain' | 'value' | 'tradeoff' | 'artifact' | 'inflection' | 'shared-affiliation';

// V2 Hook Pack (replaces HookFact as primary output)
export interface HookPack {
  hook_fact: {
    claim: string;
    source_url: string;
    evidence: string;
  };
  bridge: {
    like_you_line: string;
    bridge_angle: BridgeAngle;
    why_relevant: string;
  };
  scores: {
    identity_conf: number;
    non_generic: number;
    bridgeability: number;
    overall: number;
  };
}

// Identity fingerprint for disambiguation
export interface IdentityFingerprint {
  canonical_name: string;
  company: string;
  role_keywords: string[];
  disambiguators: string[];  // product areas, prior companies, geography, business units
  confounders: { name: string; negative_keywords: string[] }[];
}

// Bridge hypothesis for bridge-first search
export interface BridgeHypothesis {
  type: 'domain' | 'value' | 'tradeoff';
  keywords: string[];
  query_templates: string[];
  proof_target: string;
}

// Legacy V1 Hook Fact (kept for backward compatibility)
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
  // V2 Hook Packs (primary output)
  hookPacks?: HookPack[];
  
  // Research data
  exaQueries?: string[];
  exaResults?: ExaResult[];
  selectedSources?: string[];
  
  // Legacy compatibility (V1)
  hookFacts?: HookFact[];
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
  
  // Debug (test harness only)
  debug?: {
    // V2 debug fields
    identityFingerprint?: IdentityFingerprint;
    bridgeHypotheses?: BridgeHypothesis[];
    candidateUrls?: { url: string; title: string; passed_niche_gate: boolean; reasons: string[] }[];
    
    // V1 legacy fields (kept for compatibility)
    queryPlan?: any;
    queriesUsed?: string[];
    urlScores?: any[];
    urlsFetched?: string[];
    factRejectionReasons?: string[];
    notes?: string;
    identityAnchor?: {
      confirmed: boolean;
      identityUrls: string[];
      identityScores: any[];
      notes?: string;
    };
  };
}
