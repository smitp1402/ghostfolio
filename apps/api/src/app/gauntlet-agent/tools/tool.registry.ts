import { AccountService } from '@ghostfolio/api/app/account/account.service';
import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';

import type { DynamicTool } from '@langchain/core/tools';

import { createActivitiesListTool } from './activities-list.tool';
import { createCashTransferTool } from './cash-transfer.tool';
import { createMarketHistoricalTool } from './market-historical.tool';
import { createPortfolioDetailsTool } from './portfolio-details.tool';
import { createPortfolioPerformanceTool } from './portfolio-performance.tool';
import { createPortfolioReportTool } from './portfolio-report.tool';

/**
 * Builds and returns the LangChain tools for the Gauntlet agent.
 * userId and userCurrency are bound so the tool executor can call
 * PortfolioService.getDetails/getPerformance/getReport, OrderService.getOrders, and DataProviderService.getHistorical for the authenticated user.
 */
export function getGauntletTools(
  accountService: AccountService,
  portfolioService: PortfolioService,
  orderService: OrderService,
  dataProviderService: DataProviderService,
  userId: string,
  userCurrency: string
): DynamicTool[] {
  return [
    createPortfolioDetailsTool(portfolioService, userId),
    createPortfolioPerformanceTool(portfolioService, userId),
    createPortfolioReportTool(portfolioService, userId),
    createActivitiesListTool(orderService, userId, userCurrency),
    createMarketHistoricalTool(dataProviderService),
    createCashTransferTool(accountService, userId)
  ];
}
