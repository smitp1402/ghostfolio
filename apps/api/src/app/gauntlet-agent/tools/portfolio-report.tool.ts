import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import type {
  PortfolioReportResponse,
  PortfolioReportRule
} from '@ghostfolio/common/interfaces';

import { DynamicTool } from '@langchain/core/tools';

function formatRule(rule: PortfolioReportRule): string {
  const status = rule.value === true ? 'Fulfilled' : 'Not fulfilled';
  const msg = rule.evaluation ? ` (${rule.evaluation})` : '';
  return `- ${rule.name}: ${status}${msg}`;
}

function formatReportResponse(result: PortfolioReportResponse): string {
  const parts: string[] = [];
  const { xRay } = result;
  if (!xRay) {
    return 'No report data available.';
  }
  const { statistics, categories } = xRay;
  if (statistics) {
    parts.push(
      `Rules: ${statistics.rulesFulfilledCount ?? 0} of ${statistics.rulesActiveCount ?? 0} fulfilled.`
    );
  }
  if (categories && categories.length > 0) {
    for (const cat of categories) {
      parts.push(`\n${cat.name}:`);
      if (cat.rules?.length) {
        for (const rule of cat.rules) {
          parts.push(formatRule(rule));
        }
      } else {
        parts.push('- No rules');
      }
    }
  }
  return parts.length > 0 ? parts.join('\n').trim() : 'No report data available.';
}

/**
 * Builds the portfolio_report LangChain tool. Returns the user's portfolio
 * report (rule-based: liquidity, emergency fund, currency risk, etc.).
 * Takes no arguments; user is implicit via bound userId.
 */
export function createPortfolioReportTool(
  portfolioService: PortfolioService,
  userId: string
): DynamicTool {
  return new DynamicTool({
    name: 'portfolio_report',
    description:
      'Use when the user asks to run their portfolio report, check for rule violations, do a risk check, or see compliance/rule status. Do not use for allocation, performance, or holdings (use portfolio_details or portfolio_performance for those).',
    func: async (_input: unknown): Promise<string> => {
      try {
        const result = await portfolioService.getReport({
          impersonationId: userId,
          userId
        });
        return formatReportResponse(result);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unknown error fetching portfolio report';
        return `Error: Could not retrieve portfolio report. ${message}`;
      }
    }
  });
}
