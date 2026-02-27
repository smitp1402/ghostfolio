import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import type { PortfolioPerformanceResponse } from '@ghostfolio/common/interfaces';
import type { DateRange } from '@ghostfolio/common/types';

import { DynamicTool } from '@langchain/core/tools';

const VALID_DATE_RANGES: DateRange[] = [
  '1d',
  '1y',
  '5y',
  'max',
  'mtd',
  'wtd',
  'ytd'
];

function parseDateRangeInput(input: unknown): DateRange {
  if (input == null) {
    return 'max';
  }
  let raw: string | undefined;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as Record<string, unknown>;
      raw = typeof parsed.dateRange === 'string' ? parsed.dateRange : undefined;
    } catch {
      raw = input.trim() || undefined;
    }
  } else if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.args === 'string') {
      try {
        const parsed = JSON.parse(obj.args) as Record<string, unknown>;
        raw = typeof parsed.dateRange === 'string' ? parsed.dateRange : undefined;
      } catch {
        raw = undefined;
      }
    } else {
      raw = typeof obj.dateRange === 'string' ? obj.dateRange : undefined;
    }
  } else {
    return 'max';
  }
  if (!raw) {
    return 'max';
  }
  const normalized = raw.toLowerCase().trim();
  if (VALID_DATE_RANGES.includes(normalized as DateRange)) {
    return normalized as DateRange;
  }
  // Year like '2024'
  if (/^\d{4}$/.test(normalized)) {
    return normalized;
  }
  return 'max';
}

function formatPerformanceResponse(result: PortfolioPerformanceResponse): string {
  const parts: string[] = [];
  const p = result.performance;
  if (p) {
    parts.push(
      `Net performance: ${p.netPerformance ?? 0}`,
      `Net performance (%): ${(p.netPerformancePercentage ?? 0).toFixed(2)}%`,
      `Current net worth: ${p.currentNetWorth ?? p.currentValueInBaseCurrency ?? 0}`,
      `Total investment: ${p.totalInvestment ?? 0}`
    );
    if (
      p.netPerformancePercentageWithCurrencyEffect != null &&
      p.netPerformancePercentageWithCurrencyEffect !== p.netPerformancePercentage
    ) {
      parts.push(
        `Net performance with currency effect (%): ${p.netPerformancePercentageWithCurrencyEffect.toFixed(2)}%`
      );
    }
  }
  if (result.chart && result.chart.length > 0) {
    const first = result.chart[0];
    const last = result.chart[result.chart.length - 1];
    const firstVal =
      first?.netWorth ?? first?.value ?? first?.valueWithCurrencyEffect;
    const lastVal =
      last?.netWorth ?? last?.value ?? last?.valueWithCurrencyEffect;
    if (firstVal != null || lastVal != null) {
      parts.push(
        `Chart: ${result.chart.length} points; start ${firstVal ?? 'N/A'} → end ${lastVal ?? 'N/A'}`
      );
    }
  }
  if (result.hasErrors) {
    parts.push('(Note: Some data may be incomplete due to calculation errors.)');
  }
  return parts.length > 0 ? parts.join('\n') : 'No performance data available.';
}

/**
 * Builds the portfolio_performance LangChain tool. Returns performance over a
 * date range (net performance %, current net worth, total investment, etc.).
 */
export function createPortfolioPerformanceTool(
  portfolioService: PortfolioService,
  userId: string
): DynamicTool {
  return new DynamicTool({
    name: 'portfolio_performance',
    description:
      'Use when the user asks how their portfolio performed over a period, e.g. "How did my portfolio perform this year?", "Performance since max", "Returns over the last 6 months", "Performance in 2024". Do not use for current snapshot or allocation (use portfolio_details for that). Optional input: JSON with dateRange (e.g. "1d", "1y", "5y", "max", "mtd", "wtd", "ytd", or year "2024"). Default is "max".',
    func: async (input: unknown): Promise<string> => {
      try {
        const dateRange = parseDateRangeInput(input);
        const result = await portfolioService.getPerformance({
          dateRange,
          impersonationId: userId,
          userId
        });
        return formatPerformanceResponse(result);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unknown error fetching portfolio performance';
        return `Error: Could not retrieve portfolio performance. ${message}`;
      }
    }
  });
}
