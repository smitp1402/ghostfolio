import { OrderService } from '@ghostfolio/api/app/order/order.service';
import type { Activity } from '@ghostfolio/common/interfaces';
import type { Filter } from '@ghostfolio/common/interfaces';

import { DynamicTool } from '@langchain/core/tools';

/** Optional args the LLM can pass for filtering activities. */
interface ActivitiesListToolArgs {
  startDate?: string;
  endDate?: string;
  symbol?: string;
  accountId?: string;
  take?: number;
}

function parseOptionalArgs(input: unknown): ActivitiesListToolArgs {
  if (input == null) {
    return {};
  }
  let parsed: Record<string, unknown>;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input) as Record<string, unknown>;
    } catch {
      return {};
    }
  } else if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.args === 'string') {
      try {
        parsed = JSON.parse(obj.args) as Record<string, unknown>;
      } catch {
        return {};
      }
    } else {
      parsed = obj;
    }
  } else {
    return {};
  }
  return {
    startDate:
      typeof parsed.startDate === 'string' ? parsed.startDate : undefined,
    endDate: typeof parsed.endDate === 'string' ? parsed.endDate : undefined,
    symbol: typeof parsed.symbol === 'string' ? parsed.symbol : undefined,
    accountId:
      typeof parsed.accountId === 'string' ? parsed.accountId : undefined,
    take:
      typeof parsed.take === 'number' && parsed.take > 0 ? parsed.take : undefined
  };
}

function formatActivity(a: Activity): string {
  const date = a.date instanceof Date ? a.date.toISOString().slice(0, 10) : String(a.date ?? '');
  const type = a.type ?? 'N/A';
  const symbolOrName =
    a.SymbolProfile?.symbol ?? a.SymbolProfile?.name ?? 'N/A';
  const quantity = a.quantity ?? 0;
  const unitPrice = a.unitPrice ?? 0;
  const value = a.valueInBaseCurrency ?? a.value ?? quantity * unitPrice;
  const accountName = a.account?.name ?? 'N/A';
  return `${date} | ${type} | ${symbolOrName} | qty ${quantity} @ ${unitPrice} | value ${value} | ${accountName}`;
}

/**
 * Builds the activities_list LangChain tool. Uses the provided userId and
 * userCurrency (bound when building the tool) so the LLM does not need them.
 */
export function createActivitiesListTool(
  orderService: OrderService,
  userId: string,
  userCurrency: string
): DynamicTool {
  return new DynamicTool({
    name: 'activities_list',
    description:
      'Use when the user asks for recent transactions, list of orders, "what did I buy/sell?", "my activities", or similar; optionally with a date range or symbol. Pass optional filters as a JSON string in the "args" parameter: e.g. {"startDate":"2024-01-01","endDate":"2024-12-31","symbol":"AAPL","accountId":"...","take":20}.',
    func: async (input: unknown): Promise<string> => {
      try {
        const args = parseOptionalArgs(input);
        const take = args.take ?? 20;
        const startDate = args.startDate
          ? new Date(args.startDate)
          : undefined;
        const endDate = args.endDate ? new Date(args.endDate) : undefined;
        const filters: Filter[] = [];
        if (args.symbol) {
          filters.push({
            id: args.symbol.toLowerCase(),
            type: 'SEARCH_QUERY'
          });
        }
        if (args.accountId) {
          filters.push({
            id: args.accountId,
            type: 'ACCOUNT'
          });
        }

        const result = await orderService.getOrders({
          userId,
          userCurrency,
          take,
          includeDrafts: false,
          withExcludedAccountsAndActivities: true,
          startDate: isNaN(startDate?.getTime() ?? NaN) ? undefined : startDate,
          endDate: isNaN(endDate?.getTime() ?? NaN) ? undefined : endDate,
          filters: filters.length > 0 ? filters : undefined
        });

        const activities = result.activities ?? [];
        if (activities.length === 0) {
          return 'No activities found for the given filters.';
        }

        const lines = activities.map(formatActivity);
        return `Activities (${activities.length}):\n${lines.join('\n')}`;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown error fetching activities';
        return `Error: Could not retrieve activities. ${message}`;
      }
    }
  });
}
