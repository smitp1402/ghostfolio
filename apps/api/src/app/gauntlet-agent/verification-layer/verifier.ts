import { cashTransferSafetyRule } from './rules/cash-transfer-safety.rule';
import { domainScopeRule } from './rules/domain-scope.rule';
import { marketDataFreshnessRule } from './rules/market-data-freshness.rule';
import { noInvestmentAdviceRule } from './rules/no-investment-advice.rule';
import { numericConsistencyRule } from './rules/numeric-consistency.rule';
import { toolGroundingRule } from './rules/tool-grounding.rule';
import { uncertaintyRule } from './rules/uncertainty-rule';
import {
  VerificationConfig,
  VerificationContext,
  VerificationEvaluation,
  VerificationResult,
  VerificationRule,
  VerificationVerdict
} from './types';
import {
  DEFAULT_HARD_BLOCK_MESSAGE,
  DEFAULT_VERIFICATION_CONFIG
} from './verification.config';

export const DEFAULT_VERIFICATION_RULES: VerificationRule[] = [
  domainScopeRule,
  noInvestmentAdviceRule,
  toolGroundingRule,
  marketDataFreshnessRule,
  cashTransferSafetyRule,
  numericConsistencyRule,
  uncertaintyRule
];

export async function verifyResponse({
  context,
  config = DEFAULT_VERIFICATION_CONFIG,
  rules = DEFAULT_VERIFICATION_RULES
}: {
  context: VerificationContext;
  config?: VerificationConfig;
  rules?: VerificationRule[];
}): Promise<VerificationResult> {
  let workingResponse = context.draftResponse;
  const reasons: string[] = [];
  const evaluations: VerificationEvaluation[] = [];
  let finalVerdict: VerificationVerdict = 'PASS';

  for (const rule of rules) {
    const decision = await rule.evaluate(
      { ...context, draftResponse: workingResponse },
      config
    );

    evaluations.push({
      ruleName: rule.name,
      verdict: decision.verdict,
      reason: decision.reason,
      metadata: decision.metadata
    });

    if (decision.verdict === 'PASS') {
      continue;
    }

    reasons.push(`${rule.name}:${decision.reason}`);

    if (decision.verdict === 'BLOCK') {
      finalVerdict = 'BLOCK';
      workingResponse = config.hardBlockMessage || DEFAULT_HARD_BLOCK_MESSAGE;
      break;
    }

    if (decision.verdict === 'REWRITE') {
      finalVerdict = mergeVerdicts(finalVerdict, 'REWRITE');
      if (decision.rewrittenResponse?.trim()) {
        workingResponse = decision.rewrittenResponse.trim();
      }
      continue;
    }

    if (decision.verdict === 'WARN') {
      finalVerdict = mergeVerdicts(finalVerdict, 'WARN');
    }
  }

  return {
    verdict: finalVerdict,
    response: workingResponse.trim() || config.hardBlockMessage,
    reasons,
    evaluations
  };
}

function mergeVerdicts(
  current: VerificationVerdict,
  incoming: VerificationVerdict
): VerificationVerdict {
  const rank: Record<VerificationVerdict, number> = {
    PASS: 0,
    WARN: 1,
    REWRITE: 2,
    BLOCK: 3
  };
  return rank[incoming] > rank[current] ? incoming : current;
}
