import {
  VerificationConfig,
  VerificationContext,
  VerificationRule,
  VerificationRuleDecision
} from '../types';

function hasDate(input: string): boolean {
  return /\b\d{4}-\d{2}(-\d{2})?\b|\b(ytd|mtd|wtd|last|since|from|to|year|month)\b/i.test(
    input
  );
}

function mentionsMarketData(input: string): boolean {
  return /\b(price|market|historical|high|low|close)\b/i.test(input);
}

function hasAnyKeyword(input: string, keywords: string[]): boolean {
  const normalized = input.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

export const marketDataFreshnessRule: VerificationRule = {
  name: 'market_data_freshness',
  evaluate(
    context: VerificationContext,
    config: VerificationConfig
  ): VerificationRuleDecision {
    if (!mentionsMarketData(context.draftResponse)) {
      return {
        verdict: 'PASS',
        reason: 'non_market_response'
      };
    }

    const hasDateContext =
      hasDate(context.draftResponse) ||
      context.toolOutputs.some((output) => hasDate(output));
    const hasSourceContext =
      hasAnyKeyword(context.draftResponse, config.marketDataSourceKeywords) ||
      context.toolOutputs.some((output) =>
        hasAnyKeyword(output, config.marketDataSourceKeywords)
      );

    if (!hasDateContext || !hasSourceContext) {
      return {
        verdict: 'WARN',
        reason: 'market_data_missing_date_or_source',
        metadata: {
          hasDateContext,
          hasSourceContext
        }
      };
    }

    return {
      verdict: 'PASS',
      reason: 'market_data_freshness_pass'
    };
  }
};
