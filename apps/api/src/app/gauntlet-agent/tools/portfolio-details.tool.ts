import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';

import { DynamicTool } from '@langchain/core/tools';

/**
 * Builds the portfolio_details LangChain tool. The tool uses the provided userId
 * (bound when building the tool) so the LLM does not need to know the user id.
 */
export function createPortfolioDetailsTool(
  portfolioService: PortfolioService,
  userId: string
): DynamicTool {
  return new DynamicTool({
    name: 'portfolio_details',
    description:
      "Get the user's portfolio summary, allocation, holdings, and accounts. Use this when the user asks about their portfolio, allocation, \"how is my portfolio\", or wants a summary of their investments.",
    func: async (): Promise<string> => {
      try {
        const result = await portfolioService.getDetails({
          impersonationId: userId,
          userId,
          withMarkets: false,
          withSummary: true
        });

        const parts: string[] = [];

        if (result.summary) {
          const s = result.summary;
          parts.push(
            [
              'Summary:',
              `- Total value (base currency): ${s.totalValueInBaseCurrency ?? 'N/A'}`,
              `- Gross performance: ${s.grossPerformance ?? 'N/A'}`,
              `- Net performance: ${s.netPerformance ?? 'N/A'}`,
              `- Annualized performance (%): ${s.annualizedPerformancePercent ?? 'N/A'}`,
              `- Cash: ${s.cash ?? 'N/A'}`,
              `- Activity count: ${s.activityCount ?? 0}`
            ].join('\n')
          );
        }

        const holdingsList = Object.values(result.holdings).map((h) => ({
          symbol: h.symbol,
          name: h.name,
          allocationInPercentage: h.allocationInPercentage,
          valueInBaseCurrency: h.valueInBaseCurrency,
          quantity: h.quantity,
          currency: h.currency
        }));

        if (holdingsList.length > 0) {
          parts.push(
            'Holdings (allocation %):\n' +
              holdingsList
                .sort((a, b) => (b.allocationInPercentage ?? 0) - (a.allocationInPercentage ?? 0))
                .map(
                  (h) =>
                    `- ${h.symbol} (${h.name}): ${((h.allocationInPercentage ?? 0) * 100).toFixed(2)}%, value ${h.valueInBaseCurrency ?? 0} ${h.currency}`
                )
                .join('\n')
          );
        }

        const accountsList = Object.entries(result.accounts || {}).map(
          ([id, a]) => ({
            id,
            name: a.name,
            valueInBaseCurrency: a.valueInBaseCurrency,
            currency: a.currency
          })
        );
        if (accountsList.length > 0) {
          parts.push(
            'Accounts:\n' +
              accountsList
                .map(
                  (a) =>
                    `- ${a.name}: ${a.valueInBaseCurrency ?? 0} ${a.currency}`
                )
                .join('\n')
          );
        }

        if (result.hasErrors) {
          parts.push(
            '(Note: Some data may be incomplete due to calculation errors.)'
          );
        }

        return parts.length > 0 ? parts.join('\n\n') : 'No portfolio data available.';
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown error fetching portfolio';
        return `Error: Could not retrieve portfolio details. ${message}`;
      }
    }
  });
}
