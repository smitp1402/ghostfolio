import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { DataSource } from '@prisma/client';
import { endOfMonth, endOfYear, isValid, parseISO } from 'date-fns';
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

function parseFlexibleDate(input: string, boundary: 'start' | 'end'): Date | null {
  const value = input.trim();
  // Accept year-only for convenience (e.g. "2020")
  if (/^\d{4}$/.test(value)) {
    const yearStart = parseISO(`${value}-01-01`);
    if (!isValid(yearStart)) {
      return null;
    }
    return boundary === 'start' ? yearStart : endOfYear(yearStart);
  }
  // Accept year-month (e.g. "2020-06")
  if (/^\d{4}-\d{2}$/.test(value)) {
    const monthStart = parseISO(`${value}-01`);
    if (!isValid(monthStart)) {
      return null;
    }
    return boundary === 'start' ? monthStart : endOfMonth(monthStart);
  }
  // Accept full date (e.g. "2020-06-15")
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const fullDate = parseISO(value);
    return isValid(fullDate) ? fullDate : null;
  }
  return null;
}

/**
 * Builds the market_historical LangChain tool. Returns historical market price
 * data for a symbol over a date range. Uses DynamicTool with Zod validation
 * so the LLM is prompted to pass symbol, dataSource, and from/to dates.
 */
export function createMarketHistoricalTool(
  dataProviderService: DataProviderService
): DynamicTool {
  return new DynamicTool({
    name: 'market_historical',
    description:
      'Use when the user asks for the historical price of a symbol on a date or over a date range, e.g. "What was the price of X on date D?", "Historical price for symbol Y from A to B", "Price of AAPL on 2024-01-15", "Report of MSFT in 2012". Pass a JSON object with required fields: symbol (string), dataSource (string; e.g. YAHOO, COINGECKO), from/to as YYYY, YYYY-MM, or YYYY-MM-DD.',
    func: async (input: unknown): Promise<string> => {
      try {
        const raw =
          typeof input === 'string' ? JSON.parse(input || '{}') : input ?? {};
        const parsed = marketHistoricalSchema.safeParse(raw);
        if (!parsed.success) {
          const msg = parsed.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join('; ');
          return `Error: Invalid arguments. ${msg}. Required: symbol, dataSource, from, to (date format YYYY, YYYY-MM, or YYYY-MM-DD).`;
        }
        const { symbol, dataSource, from, to } = parsed.data;

        const fromDate = parseFlexibleDate(from, 'start');
        const toDate = parseFlexibleDate(to, 'end');
        if (!fromDate || !toDate) {
          return 'Error: Invalid date format. Use YYYY, YYYY-MM, or YYYY-MM-DD for from and to.';
        }
        if (fromDate > toDate) {
          return 'Error: from date must be before or equal to to date.';
        }

        if (!DATA_SOURCE_VALUES.includes(dataSource)) {
          return `Error: Invalid dataSource. Must be one of: ${DATA_SOURCE_VALUES.join(', ')}.`;
        }

        let result = await dataProviderService.getHistorical(
          [{ dataSource: dataSource as DataSource, symbol }],
          'day',
          fromDate,
          toDate
        );

        let bySymbol = result[symbol];
        if (!bySymbol || Object.keys(bySymbol).length === 0) {
          // Fallback to provider fetch when local MarketData cache has no rows.
          result = await dataProviderService.getHistoricalRaw({
            assetProfileIdentifiers: [
              { dataSource: dataSource as DataSource, symbol }
            ],
            from: fromDate,
            to: toDate
          });
          bySymbol = result[symbol];
        }

        if (!bySymbol || Object.keys(bySymbol).length === 0) {
          return `No historical data found for symbol ${symbol} and date range ${from} to ${to}.`;
        }

        const entries = Object.entries(bySymbol)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, data]) => ({
            date,
            price: Number(data?.marketPrice)
          }))
          .filter((entry) => Number.isFinite(entry.price));

        if (entries.length === 0) {
          return `No historical data found for symbol ${symbol} and date range ${from} to ${to}.`;
        }

        const isSingleDayRange =
          fromDate.toISOString().slice(0, 10) === toDate.toISOString().slice(0, 10);
        if (isSingleDayRange) {
          const point = entries[entries.length - 1];
          return `${symbol}: ${point.date} -> ${point.price}`;
        }

        let highest = entries[0];
        let lowest = entries[0];
        for (const entry of entries.slice(1)) {
          if (entry.price > highest.price) {
            highest = entry;
          }
          if (entry.price < lowest.price) {
            lowest = entry;
          }
        }

        return [
          `Market report for ${symbol} (${from} to ${to})`,
          `Highest: ${highest.price} on ${highest.date}`,
          `Lowest: ${lowest.price} on ${lowest.date}`,
          `Data points: ${entries.length}`
        ].join('\n');
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
