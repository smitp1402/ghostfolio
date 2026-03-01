import {
  VerificationConfig,
  VerificationContext,
  VerificationRule,
  VerificationRuleDecision
} from '../types';

function hasAnyKeyword(input: string, keywords: string[]): boolean {
  const normalized = input.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

export const domainScopeRule: VerificationRule = {
  name: 'domain_scope',
  evaluate(
    context: VerificationContext,
    config: VerificationConfig
  ): VerificationRuleDecision {
    const userIsDomain = hasAnyKeyword(context.userMessage, config.domainKeywords);
    const userIsOutOfDomain = hasAnyKeyword(
      context.userMessage,
      config.outOfDomainKeywords
    );
    const responseIsDomain = hasAnyKeyword(
      context.draftResponse,
      config.domainKeywords
    );

    if (userIsOutOfDomain && !userIsDomain) {
      return {
        verdict: 'BLOCK',
        reason: 'user_message_is_out_of_domain'
      };
    }

    if (!responseIsDomain && userIsDomain) {
      return {
        verdict: 'REWRITE',
        reason: 'response_not_grounded_in_domain',
        rewrittenResponse:
          'I can help with your portfolio, activities, market data, or cash transfers. Could you clarify which one you want?'
      };
    }

    return {
      verdict: 'PASS',
      reason: 'domain_scope_pass'
    };
  }
};
