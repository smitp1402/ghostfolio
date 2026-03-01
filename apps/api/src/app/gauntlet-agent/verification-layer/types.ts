export type VerificationVerdict = 'PASS' | 'WARN' | 'REWRITE' | 'BLOCK';

export interface VerificationContext {
  userMessage: string;
  draftResponse: string;
  invokedTools: string[];
  toolOutputs: string[];
}

export interface VerificationConfig {
  domainKeywords: string[];
  outOfDomainKeywords: string[];
  investmentAdviceKeywords: string[];
  cashTransferConfirmationKeywords: string[];
  marketDataSourceKeywords: string[];
  uncertaintyMarkers: string[];
  hardBlockMessage: string;
}

export interface VerificationRuleDecision {
  verdict: VerificationVerdict;
  reason: string;
  rewrittenResponse?: string;
  metadata?: Record<string, unknown>;
}

export interface VerificationEvaluation {
  ruleName: string;
  verdict: VerificationVerdict;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface VerificationResult {
  verdict: VerificationVerdict;
  response: string;
  reasons: string[];
  evaluations: VerificationEvaluation[];
}

export interface VerificationRule {
  name: string;
  evaluate(
    context: VerificationContext,
    config: VerificationConfig
  ): VerificationRuleDecision | Promise<VerificationRuleDecision>;
}
