import {
  VerificationConfig,
  VerificationContext,
  VerificationRule,
  VerificationRuleDecision
} from '../types';

function includesAny(input: string, markers: string[]): boolean {
  const normalized = input.toLowerCase();
  return markers.some((marker) => normalized.includes(marker.toLowerCase()));
}

export const uncertaintyRule: VerificationRule = {
  name: 'uncertainty',
  evaluate(
    context: VerificationContext,
    config: VerificationConfig
  ): VerificationRuleDecision {
    const toolOutputCombined = context.toolOutputs.join('\n').toLowerCase();
    const hasErrorOrMissingData =
      toolOutputCombined.includes('error:') ||
      toolOutputCombined.includes('no data') ||
      toolOutputCombined.includes('not found');
    if (!hasErrorOrMissingData) {
      return {
        verdict: 'PASS',
        reason: 'tool_outputs_have_no_missing_data_signal'
      };
    }

    const responseHasUncertaintyMarker = includesAny(
      context.draftResponse,
      config.uncertaintyMarkers
    );

    if (!responseHasUncertaintyMarker) {
      return {
        verdict: 'REWRITE',
        reason: 'missing_uncertainty_when_data_is_incomplete',
        rewrittenResponse:
          'I could not fully verify all requested values from available data. Please provide additional details or try a narrower date range.'
      };
    }

    return {
      verdict: 'PASS',
      reason: 'uncertainty_rule_pass'
    };
  }
};
