import { VerificationConfig, VerificationRule, VerificationRuleDecision } from '../types';

function hasInvestmentAdvice(input: string, adviceKeywords: string[]): boolean {
  const normalized = input.toLowerCase();
  return adviceKeywords.some((keyword) =>
    normalized.includes(keyword.toLowerCase())
  );
}

export const noInvestmentAdviceRule: VerificationRule = {
  name: 'no_investment_advice',
  evaluate(context, config: VerificationConfig): VerificationRuleDecision {
    if (
      hasInvestmentAdvice(context.draftResponse, config.investmentAdviceKeywords)
    ) {
      return {
        verdict: 'REWRITE',
        reason: 'investment_advice_detected',
        rewrittenResponse:
          'I can provide portfolio information and analysis, but I cannot give buy/sell recommendations.'
      };
    }

    return {
      verdict: 'PASS',
      reason: 'no_investment_advice_pass'
    };
  }
};
