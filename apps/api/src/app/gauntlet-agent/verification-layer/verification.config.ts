import { VerificationConfig } from './types';

export const DEFAULT_HARD_BLOCK_MESSAGE =
  'I can only help with portfolio, activities, market data, and account cash transfers in this app.';

export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  domainKeywords: [
    'portfolio',
    'allocation',
    'holding',
    'holdings',
    'performance',
    'returns',
    'report',
    'risk',
    'compliance',
    'activity',
    'activities',
    'transaction',
    'transactions',
    'order',
    'orders',
    'historical',
    'price',
    'market data',
    'cash transfer',
    'transfer',
    'account'
  ],
  outOfDomainKeywords: [
    'weather',
    'recipe',
    'movie',
    'music',
    'sports',
    'travel',
    'politics',
    'typescript',
    'javascript',
    'programming'
  ],
  investmentAdviceKeywords: [
    'you should buy',
    'you should sell',
    'i recommend buying',
    'i recommend selling',
    'strong buy',
    'strong sell',
    'price target'
  ],
  cashTransferConfirmationKeywords: [
    'confirm',
    'yes',
    'proceed',
    'execute',
    'do it',
    'go ahead'
  ],
  marketDataSourceKeywords: ['yahoo', 'coingecko', 'provider', 'data source'],
  uncertaintyMarkers: [
    'could not',
    'not available',
    'insufficient data',
    'unable to verify',
    'uncertain'
  ],
  hardBlockMessage: DEFAULT_HARD_BLOCK_MESSAGE
};
