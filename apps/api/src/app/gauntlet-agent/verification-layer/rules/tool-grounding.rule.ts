import { VerificationRule, VerificationRuleDecision } from '../types';

function extractNumbers(input: string): string[] {
  return input.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
}

export const toolGroundingRule: VerificationRule = {
  name: 'tool_grounding',
  evaluate(context): VerificationRuleDecision {
    const responseNumbers = extractNumbers(context.draftResponse);
    const hasNumericClaims = responseNumbers.length > 0;
    const hasToolEvidence =
      context.invokedTools.length > 0 && context.toolOutputs.some(Boolean);

    if (hasNumericClaims && !hasToolEvidence) {
      return {
        verdict: 'REWRITE',
        reason: 'numeric_claims_without_tool_evidence'
      };
    }

    return {
      verdict: 'PASS',
      reason: 'tool_grounding_pass',
      metadata: {
        hasNumericClaims,
        invokedTools: context.invokedTools.length
      }
    };
  }
};
