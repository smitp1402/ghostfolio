import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { DataSource } from '@prisma/client';
import { parseISO, isValid } from 'date-fns';
import { z } from 'zod';

import { DynamicTool } from '@langchain/core/tools';

const DATA_SOURCE_VALUES = Object.values(DataSource) as [string, ...string[]];

/** Zod schema for market_historical tool args (symbol, dataSource, from, to). */
const marketHistoricalSchema = z.object({
  symbol: z.string(),
  dataSource: z.string(),
  from: z.string(),
  to: z.string()
});

/**
 * Builds the market_historical LangChain tool. Returns historical market price
 * data for a symbol over a date range. Uses DynamicTool with Zod validation
 * so the LLM is prompted to pass symbol, dataSource, from, to (YYYY-MM-DD).
 */
export function createMarketHistoricalTool(
  dataProviderService: DataProviderService
): DynamicTool {
  return new DynamicTool({
    name: 'market_historical',
    description:
      'Use when the user asks for the historical price of a symbol on a date or over a date range, e.g. "What was the price of X on date D?", "Historical price for symbol Y from A to B", "Price of AAPL on 2024-01-15". Pass a JSON object with required fields: symbol (string), dataSource (string; e.g. YAHOO, COINGECKO), from (YYYY-MM-DD), to (YYYY-MM-DD).',
    func: async (input: unknown): Promise<string> => {
      try {
        const raw =
          typeof input === 'string' ? JSON.parse(input || '{}') : input ?? {};
        const parsed = marketHistoricalSchema.safeParse(raw);
        if (!parsed.success) {
          const msg = parsed.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join('; ');
          return `Error: Invalid arguments. ${msg}. Required: symbol, dataSource, from, to (YYYY-MM-DD).`;
        }
        const { symbol, dataSource, from, to } = parsed.data;

        const fromDate = parseISO(from);
        const toDate = parseISO(to);
        if (!isValid(fromDate) || !isValid(toDate)) {
          return 'Error: Invalid date format. Use YYYY-MM-DD for from and to.';
        }
        if (fromDate > toDate) {
          return 'Error: from date must be before or equal to to date.';
        }

        if (!DATA_SOURCE_VALUES.includes(dataSource)) {
          return `Error: Invalid dataSource. Must be one of: ${DATA_SOURCE_VALUES.join(', ')}.`;
        }

        const result = await dataProviderService.getHistorical(
          [{ dataSource: dataSource as DataSource, symbol }],
          'day',
          fromDate,
          toDate
        );

        const bySymbol = result[symbol];
        if (!bySymbol || Object.keys(bySymbol).length === 0) {
          return `No historical data found for symbol ${symbol} and date range ${from} to ${to}.`;
        }

        const lines = Object.entries(bySymbol)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(
            ([date, data]) =>
              `${symbol}: ${date} -> ${data?.marketPrice ?? 'N/A'}`
          );
        return lines.join('\n');
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unknown error fetching historical data';
        return `Error: Could not retrieve market historical data. ${message}`;
      }
    }
  });
}
