import { VerificationRule, VerificationRuleDecision } from '../types';

function extractNumericTokens(input: string): Set<string> {
  return new Set(input.match(/\b\d+(?:\.\d+)?%?\b/g) ?? []);
}

export const numericConsistencyRule: VerificationRule = {
  name: 'numeric_consistency',
  evaluate(context): VerificationRuleDecision {
    const responseTokens = extractNumericTokens(context.draftResponse);
    if (responseTokens.size === 0) {
      return {
        verdict: 'PASS',
        reason: 'no_numeric_tokens_in_response'
      };
    }

    const evidenceTokens = extractNumericTokens(context.toolOutputs.join('\n'));
    if (evidenceTokens.size === 0) {
      return {
        verdict: 'WARN',
        reason: 'no_numeric_tokens_in_tool_output'
      };
    }

    const mismatches = [...responseTokens].filter(
      (token) => !evidenceTokens.has(token)
    );

    if (mismatches.length === 0) {
      return {
        verdict: 'PASS',
        reason: 'numeric_consistency_pass'
      };
    }

    return {
      verdict: 'WARN',
      reason: 'possible_numeric_mismatch',
      metadata: {
        mismatches: mismatches.slice(0, 20)
      }
    };
  }
};
