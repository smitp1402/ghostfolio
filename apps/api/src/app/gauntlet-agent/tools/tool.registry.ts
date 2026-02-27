import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';

import type { DynamicTool } from '@langchain/core/tools';

import { createPortfolioDetailsTool } from './portfolio-details.tool';

/**
 * Builds and returns the LangChain tools for the Gauntlet agent.
 * Phase 1: only portfolio_details. userId is bound so the tool executor
 * can call PortfolioService.getDetails for the authenticated user.
 */
export function getGauntletTools(
  portfolioService: PortfolioService,
  userId: string
): DynamicTool[] {
  return [createPortfolioDetailsTool(portfolioService, userId)];
}
