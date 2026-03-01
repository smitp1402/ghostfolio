import {
  VerificationConfig,
  VerificationContext,
  VerificationRule,
  VerificationRuleDecision
} from '../types';

function includesAny(input: string, values: string[]): boolean {
  const normalized = input.toLowerCase();
  return values.some((value) => normalized.includes(value.toLowerCase()));
}

export const cashTransferSafetyRule: VerificationRule = {
  name: 'cash_transfer_safety',
  evaluate(
    context: VerificationContext,
    config: VerificationConfig
  ): VerificationRuleDecision {
    const transferIntent =
      /\b(transfer|move cash|deposit|withdraw)\b/i.test(context.userMessage) ||
      context.invokedTools.includes('cash_transfer');
    if (!transferIntent) {
      return {
        verdict: 'PASS',
        reason: 'non_transfer_request'
      };
    }

    const response = context.draftResponse.toLowerCase();
    const indicatesExecution =
      response.includes('transfer completed') ||
      response.includes('executed') ||
      response.includes('successfully transferred');
    const userConfirmed = includesAny(
      context.userMessage,
      config.cashTransferConfirmationKeywords
    );
    const hasPreviewSignal = context.toolOutputs.some((output) =>
      output.toLowerCase().includes('action not executed')
    );

    if (indicatesExecution && !userConfirmed) {
      return {
        verdict: 'BLOCK',
        reason: 'transfer_execution_without_explicit_confirmation'
      };
    }

    if (!indicatesExecution && !hasPreviewSignal) {
      return {
        verdict: 'REWRITE',
        reason: 'missing_preview_before_transfer',
        rewrittenResponse:
          'Before executing a transfer, I need to run a preview first and then wait for your explicit confirmation.'
      };
    }

    return {
      verdict: 'PASS',
      reason: 'cash_transfer_safety_pass'
    };
  }
};
