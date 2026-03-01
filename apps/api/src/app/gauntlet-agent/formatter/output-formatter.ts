import { VerificationResult } from '../verification-layer/types';

export interface OutputCitation {
  source: string;
  evidence: string;
}

export interface FormattedAgentOutput {
  answer: string;
  confidence: number;
  citations: OutputCitation[];
  warnings: string[];
  verdict: VerificationResult['verdict'];
  reasons: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toCitationEvidence(input: string): string {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'No tool evidence captured.';
  }
  return normalized.slice(0, 220);
}

function computeConfidence({
  verdict,
  reasonsCount,
  citationCount
}: {
  verdict: VerificationResult['verdict'];
  reasonsCount: number;
  citationCount: number;
}): number {
  let score =
    verdict === 'PASS'
      ? 0.88
      : verdict === 'WARN'
        ? 0.72
        : verdict === 'REWRITE'
          ? 0.58
          : 0.2;

  score += Math.min(0.08, citationCount * 0.02);
  score -= Math.min(0.12, reasonsCount * 0.03);

  return Number(clamp(score, 0.05, 0.99).toFixed(2));
}

export function formatStructuredOutput({
  verification,
  invokedTools,
  toolOutputs
}: {
  verification: VerificationResult;
  invokedTools: string[];
  toolOutputs: string[];
}): FormattedAgentOutput {
  const citations = invokedTools.map((source, index) => ({
    source,
    evidence: toCitationEvidence(toolOutputs[index] ?? '')
  }));

  const warnings =
    verification.verdict === 'WARN'
      ? verification.reasons
      : verification.evaluations
          .filter((evaluation) => evaluation.verdict === 'WARN')
          .map((evaluation) => `${evaluation.ruleName}:${evaluation.reason}`);

  const confidence = computeConfidence({
    verdict: verification.verdict,
    reasonsCount: verification.reasons.length,
    citationCount: citations.length
  });

  return {
    answer: verification.response,
    confidence,
    citations,
    warnings,
    verdict: verification.verdict,
    reasons: verification.reasons
  };
}
