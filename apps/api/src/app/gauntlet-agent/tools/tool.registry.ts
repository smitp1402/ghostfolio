import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';

import type { DynamicTool } from '@langchain/core/tools';

import { createActivitiesListTool } from './activities-list.tool';
import { createMarketHistoricalTool } from './market-historical.tool';
import { createPortfolioDetailsTool } from './portfolio-details.tool';

/**
 * Builds and returns the LangChain tools for the Gauntlet agent.
 * userId and userCurrency are bound so the tool executor can call
 * PortfolioService.getDetails, OrderService.getOrders, and DataProviderService.getHistorical for the authenticated user.
 */
export function getGauntletTools(
  portfolioService: PortfolioService,
  orderService: OrderService,
  dataProviderService: DataProviderService,
  userId: string,
  userCurrency: string
): DynamicTool[] {
  return [
    createPortfolioDetailsTool(portfolioService, userId),
    createActivitiesListTool(orderService, userId, userCurrency),
    createMarketHistoricalTool(dataProviderService)
  ];
}
