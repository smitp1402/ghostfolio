import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import {
  PROPERTY_API_KEY_OPENROUTER,
  PROPERTY_OPENROUTER_MODEL
} from '@ghostfolio/common/config';

import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage
} from '@langchain/core/messages';

import { ConversationMemoryService } from './memory-system/conversation-memory.service';
import { getGauntletTools } from './tools/tool.registry';

/** Default OpenRouter model when OPENROUTER_MODEL is not set. Must support tool/function calling. Use a faster model for lower latency. */
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';

/** Number of recent messages to include for intent check when conversation has history (last 2 turns). */
const INTENT_CONTEXT_MESSAGE_LIMIT = 4;

const INTENT_OFF_TOPIC_CONFIDENCE_THRESHOLD = 0.93;
const INTENT_HARD_BLOCK_CONFIDENCE_THRESHOLD = 0.97;
const INTENT_SECOND_CHANCE_MIN_CONFIDENCE = 0.9;
const SHORT_FOLLOW_UP_MAX_WORDS = 8;
const SUMMARY_MAX_CHARS = 160;

const DOMAIN_KEYWORD_REGEX =
  /\b(portfolio|allocation|holding|holdings|position|positions|investments?|account summary|performance|returns?|pnl|profit|loss|drawdown|activities?|transactions?|orders?|bought|sold|buy|sell|report|rule violations?|risk check|compliance|historical|price|prices|market data)\b/i;
const DATE_OR_RANGE_REGEX =
  /\b\d{4}-\d{2}-\d{2}\b|\b(last|since|from|to|between|month|quarter|year|ytd)\b/i;
const TICKER_LIKE_REGEX = /\b[A-Z]{2,10}\b/;
const FOLLOW_UP_PRONOUN_REGEX = /\b(it|that|this|those|them|there|one|ones)\b/i;
const OUT_OF_DOMAIN_REGEX =
  /\b(weather|recipe|movie|music|joke|sports|travel|politics|coding|programming|typescript|javascript)\b/i;
const MONTH_NAME_TO_NUMBER: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12'
};
const CRYPTO_SYMBOLS = new Set([
  'BTC',
  'ETH',
  'SOL',
  'ADA',
  'XRP',
  'DOGE',
  'DOT',
  'AVAX',
  'MATIC',
  'BNB'
]);

/** Prompt for structured intent check used by hybrid gating logic. */
const INTENT_SYSTEM_PROMPT = `You classify whether the user's request is in-scope for this app.

In-scope topics:
- portfolio, investments, holdings, allocation, account summary
- portfolio performance over a period (returns, since max, YTD, etc.)
- portfolio report, rule violations, risk/compliance checks
- transactions, orders, activities (what user bought/sold)
- historical market prices for a symbol over date(s)

If the user's message is a short follow-up (for example: "what about last month?", "and the year before?", "break that down", "explain that"), treat it as in-scope when recent conversation messages are in-scope.

Return ONLY valid JSON with this exact shape:
{"label":"on_topic"|"off_topic"|"uncertain","confidence":number,"reason":"short string"}

Rules:
- confidence must be between 0 and 1
- no markdown, no prose outside JSON`;

const INTENT_SECOND_CHANCE_SYSTEM_PROMPT = `You classify whether the user is asking about portfolio, activities, or market data in this app.

Be conservative before classifying off_topic: when the message could plausibly refer to recent portfolio context, prefer "uncertain".

Return ONLY valid JSON with this exact shape:
{"label":"on_topic"|"off_topic"|"uncertain","confidence":number,"reason":"short string"}

Rules:
- confidence must be between 0 and 1
- no markdown, no prose outside JSON`;

const OFF_TOPIC_MESSAGE =
  'I can only help with portfolio, activities, and market data in this app.';

const SYSTEM_PROMPT = `You are a finance-focused assistant that explains portfolio data. You only provide informational answers based on 
the data you retrieve. You must NOT give buy/sell advice or investment recommendations. If the user asks about their portfolio, allocation, or 
"how is my portfolio", use the portfolio_details tool to get the data and then summarize it in clear, natural language. If the user asks how their
 portfolio performed over a period (e.g. "How did my portfolio perform this year?", "Performance since max", "Returns over the last 6 months",
  "Performance in 2024"), use the portfolio_performance tool and summarize the results. If the user asks to run their portfolio report, check for 
  rule violations, do a risk check, or see compliance/rule status (e.g. "Run my portfolio report", "Any rule violations?", "Risk check"), 
  use the portfolio_report tool and summarize the results. If the user asks for recent transactions, list of orders, "what did I buy/sell?", 
  "my activities", or similar, use the activities_list tool and summarize the results. If the user asks for the historical price of a symbol on
   a date or over a date range (e.g. "What was the price of AAPL on 2024-01-15?", "Historical price for BTC from X to Y", "Give me a report of MSFT in 2012"), use the market_historical 
   tool with the symbol, dataSource (e.g. YAHOO for stocks, COINGECKO for crypto), and from/to dates in YYYY, YYYY-MM, or YYYY-MM-DD. If any required market_historical
   argument is missing or ambiguous, ask a concise clarification question instead of guessing. For report-style market queries, summarize the highest and lowest prices with their dates.`;

@Injectable()
export class GauntletAgentService {
  private readonly logger = new Logger(GauntletAgentService.name);

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly conversationMemoryService: ConversationMemoryService,
    private readonly dataProviderService: DataProviderService,
    private readonly orderService: OrderService,
    private readonly portfolioService: PortfolioService,
    private readonly propertyService: PropertyService
  ) {}

  private toTextContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return (content as { type?: string; text?: string }[])
        .map((c) => (c && 'text' in c ? c.text : String(c)))
        .join('');
    }
    return String(content ?? '');
  }

  private hasDomainKeyword(message: string): boolean {
    return DOMAIN_KEYWORD_REGEX.test(message);
  }

  private normalizeCompact(input: string, maxChars: number = SUMMARY_MAX_CHARS): string {
    return input.replace(/\s+/g, ' ').trim().slice(0, maxChars);
  }

  private countWords(message: string): number {
    const words = message
      .trim()
      .split(/\s+/)
      .map((word) => word.trim())
      .filter(Boolean);
    return words.length;
  }

  private isShortFollowUp(message: string): boolean {
    return this.countWords(message) <= SHORT_FOLLOW_UP_MAX_WORDS;
  }

  private hasOutOfDomainSignal(message: string): boolean {
    return OUT_OF_DOMAIN_REGEX.test(message);
  }

  private extractEntitiesFromText(content: string): string[] {
    const entities: string[] = [];
    const tickerMatches = content.match(/\b[A-Z]{2,10}\b/g) ?? [];
    for (const ticker of tickerMatches) {
      entities.push(ticker);
    }
    // Capture likely portfolio holding labels like "Microsoft Corporation" or "Penthouse Apartment".
    const titleMatches =
      content.match(
        /\b[A-Z][A-Za-z0-9&().'/-]*(?:\s+[A-Z][A-Za-z0-9&().'/-]*){0,5}\b/g
      ) ?? [];
    for (const label of titleMatches) {
      entities.push(label);
    }
    return Array.from(
      new Set(
        entities
          .map((entity) => entity.trim())
          .filter((entity) => entity.length >= 2)
          .slice(-30)
      )
    );
  }

  private hasRecentEntityHint(message: string, recentEntities: string[]): boolean {
    const normalized = message.toLowerCase();
    return recentEntities.some((entity) => {
      const compact = entity.trim();
      return compact.length >= 2 && normalized.includes(compact.toLowerCase());
    });
  }

  private hasMarketEntityHint(message: string, recentEntities: string[]): boolean {
    const tickerWithDate = TICKER_LIKE_REGEX.test(message) && DATE_OR_RANGE_REGEX.test(message);
    const directTicker = TICKER_LIKE_REGEX.test(message);
    const recentEntity = this.hasRecentEntityHint(message, recentEntities);
    return tickerWithDate || directTicker || recentEntity;
  }

  private summarizeIntentHistory(
    intentHistory: (HumanMessage | AIMessage | SystemMessage | ToolMessage)[]
  ): string {
    const lastUserMessage = [...intentHistory]
      .reverse()
      .find((historyMessage) =>
        typeof historyMessage.getType === 'function'
          ? historyMessage.getType() === 'human'
          : false
      );
    const lastAssistantMessage = [...intentHistory]
      .reverse()
      .find((historyMessage) =>
        typeof historyMessage.getType === 'function'
          ? historyMessage.getType() === 'ai'
          : false
      );
    const userText = lastUserMessage
      ? this.normalizeCompact(
          this.toTextContent((lastUserMessage as { content?: unknown }).content)
        )
      : '<none>';
    const assistantText = lastAssistantMessage
      ? this.normalizeCompact(
          this.toTextContent((lastAssistantMessage as { content?: unknown }).content)
        )
      : '<none>';
    return `last_user="${userText}"\nlast_assistant="${assistantText}"`;
  }

  private buildIntentInput({
    message,
    intentHistory,
    lastIntent,
    lastToolUsed,
    recentEntities
  }: {
    message: string;
    intentHistory: (HumanMessage | AIMessage | SystemMessage | ToolMessage)[];
    lastIntent: 'on_topic' | 'off_topic' | 'uncertain';
    lastToolUsed?: string;
    recentEntities: string[];
  }): string {
    const compactEntities =
      recentEntities
        .slice(-8)
        .map((entity) => this.normalizeCompact(entity, 64))
        .join(', ') || '<none>';
    const compactTool = lastToolUsed?.trim() || '<none>';
    const compactMessage = this.normalizeCompact(message, 240);
    return [
      `last_intent=${lastIntent}`,
      `last_tool=${compactTool}`,
      `recent_entities=${compactEntities}`,
      this.summarizeIntentHistory(intentHistory),
      `current_user="${compactMessage}"`
    ].join('\n');
  }

  private isLikelyFollowUp(message: string): boolean {
    return this.isShortFollowUp(message) || FOLLOW_UP_PRONOUN_REGEX.test(message);
  }

  private buildClarificationQuestion({
    lastToolUsed,
    recentEntities
  }: {
    lastToolUsed?: string;
    recentEntities: string[];
  }): string {
    const entityHint = recentEntities.slice(-2).join(' / ');
    const toolHint =
      lastToolUsed === 'portfolio_performance'
        ? 'performance'
        : lastToolUsed === 'activities_list'
          ? 'recent activities'
          : lastToolUsed === 'market_historical'
            ? 'market prices'
            : 'portfolio holdings';
    if (entityHint) {
      return `Do you mean ${entityHint} in your ${toolHint} context? I can help with holdings, performance, activities, or historical prices.`;
    }
    return `Can you clarify what you mean? I can help with portfolio holdings, performance, activities, or historical prices.`;
  }

  private buildMarketHistoricalArgumentQuestion(
    toolOutput: string,
    attemptedArgs: Record<string, unknown>
  ): string | undefined {
    const normalized = toolOutput.toLowerCase();
    if (!normalized.startsWith('error:')) {
      return undefined;
    }

    const missingArgs: string[] = [];
    if (normalized.includes('symbol:') && normalized.includes('required')) {
      missingArgs.push('symbol');
    }
    if (normalized.includes('datasource:') && normalized.includes('required')) {
      missingArgs.push('dataSource');
    }
    if (normalized.includes('from:') && normalized.includes('required')) {
      missingArgs.push('from');
    }
    if (normalized.includes('to:') && normalized.includes('required')) {
      missingArgs.push('to');
    }

    const maybeSymbol =
      typeof attemptedArgs.symbol === 'string' && attemptedArgs.symbol.trim()
        ? attemptedArgs.symbol.trim().toUpperCase()
        : 'the symbol';

    if (missingArgs.length > 0) {
      const joined = missingArgs.join(', ');
      return `I need a few details before I can fetch historical prices for ${maybeSymbol}: ${joined}. Please provide symbol, dataSource (YAHOO for stocks or COINGECKO for crypto), and from/to dates in YYYY, YYYY-MM, or YYYY-MM-DD.`;
    }

    if (normalized.includes('invalid date format')) {
      return `Please provide valid from/to dates in YYYY, YYYY-MM, or YYYY-MM-DD format (for example: from=2020 and to=2020, or from=2020-01-01 and to=2020-12-31).`;
    }

    if (normalized.includes('from date must be before or equal to to date')) {
      return `Your date range looks reversed. Please provide from <= to (for example: from=2020-01-01, to=2020-12-31).`;
    }

    if (normalized.includes('invalid datasource')) {
      return `Please provide a valid dataSource. Use YAHOO for stocks (like MSFT) or COINGECKO for crypto.`;
    }

    return undefined;
  }

  private parseIntentClassification(intentText: string): {
    label: 'on_topic' | 'off_topic' | 'uncertain';
    confidence: number;
    reason: string;
  } {
    try {
      const parsed = JSON.parse(intentText) as {
        label?: string;
        confidence?: number;
        reason?: string;
      };
      const label = (parsed.label ?? '').toLowerCase();
      if (
        (label === 'on_topic' || label === 'off_topic' || label === 'uncertain') &&
        typeof parsed.confidence === 'number'
      ) {
        return {
          label,
          confidence: Math.min(1, Math.max(0, parsed.confidence)),
          reason: String(parsed.reason ?? '')
        };
      }
    } catch {
      // Keep strict JSON contract for classifier output.
    }

    return { label: 'uncertain', confidence: 0.5, reason: 'unparseable_classifier_output' };
  }

  private getRecentUserMessages(
    history: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[],
    currentMessage: string
  ): string[] {
    const pastUserMessages = history
      .filter((historyMessage) =>
        typeof historyMessage.getType === 'function'
          ? historyMessage.getType() === 'human'
          : false
      )
      .map((historyMessage) =>
        this.toTextContent((historyMessage as { content?: unknown }).content)
      );
    return [...pastUserMessages, currentMessage];
  }

  private extractYearCandidate(text: string): string | undefined {
    const yearMatch = text.match(/\b(19|20)\d{2}\b/);
    return yearMatch?.[0];
  }

  private extractTickerCandidate(text: string): string | undefined {
    const upperTicker = text.match(/\b[A-Z]{2,10}\b/g);
    if (upperTicker && upperTicker.length > 0) {
      return upperTicker[upperTicker.length - 1];
    }
    const looseTicker = text.match(/\b[a-z]{2,10}\b/g);
    if (!looseTicker) {
      return undefined;
    }
    const denyList = new Set([
      'give',
      'report',
      'price',
      'market',
      'value',
      'year',
      'from',
      'to',
      'for',
      'data'
    ]);
    const candidate = looseTicker
      .map((token) => token.toLowerCase())
      .find((token) => !denyList.has(token));
    return candidate?.toUpperCase();
  }

  private extractMonthDayCandidate(text: string): { month: string; day: string } | undefined {
    const monthDayMatch = text.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+([0-3]?\d)\b/i
    );
    if (!monthDayMatch) {
      return undefined;
    }
    const month = MONTH_NAME_TO_NUMBER[monthDayMatch[1].toLowerCase()];
    if (!month) {
      return undefined;
    }
    const dayNumber = Number(monthDayMatch[2]);
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) {
      return undefined;
    }
    return { month, day: String(dayNumber).padStart(2, '0') };
  }

  private hydrateMarketHistoricalArgs(
    rawArgs: unknown,
    currentMessage: string,
    history: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[]
  ): Record<string, unknown> {
    const args =
      rawArgs && typeof rawArgs === 'object' ? { ...(rawArgs as Record<string, unknown>) } : {};
    const contextMessages = this.getRecentUserMessages(history, currentMessage);
    const contextText = contextMessages.join('\n');

    if (typeof args.symbol !== 'string' || !args.symbol.trim()) {
      const symbol = this.extractTickerCandidate(currentMessage) ?? this.extractTickerCandidate(contextText);
      if (symbol) {
        args.symbol = symbol;
      }
    }

    const yearFromCurrent = this.extractYearCandidate(currentMessage);
    const yearFromContext = yearFromCurrent ?? this.extractYearCandidate(contextText);
    const monthDay = this.extractMonthDayCandidate(currentMessage);

    if (monthDay && yearFromContext) {
      const inferredDate = `${yearFromContext}-${monthDay.month}-${monthDay.day}`;
      if (typeof args.from !== 'string' || !args.from.trim()) {
        args.from = inferredDate;
      }
      if (typeof args.to !== 'string' || !args.to.trim()) {
        args.to = inferredDate;
      }
    } else if (yearFromCurrent) {
      if (typeof args.from !== 'string' || !args.from.trim()) {
        args.from = yearFromCurrent;
      }
      if (typeof args.to !== 'string' || !args.to.trim()) {
        args.to = yearFromCurrent;
      }
    }

    if (
      typeof args.from === 'string' &&
      args.from.trim() &&
      (typeof args.to !== 'string' || !args.to.trim())
    ) {
      args.to = args.from;
    }
    if (
      typeof args.to === 'string' &&
      args.to.trim() &&
      (typeof args.from !== 'string' || !args.from.trim())
    ) {
      args.from = args.to;
    }

    if (typeof args.dataSource !== 'string' || !args.dataSource.trim()) {
      const symbol = typeof args.symbol === 'string' ? args.symbol.trim().toUpperCase() : '';
      if (symbol) {
        args.dataSource = CRYPTO_SYMBOLS.has(symbol) ? 'COINGECKO' : 'YAHOO';
      }
    }

    return args;
  }

  private shouldTreatAsOffTopic({
    keywordHit,
    entityHit,
    label,
    confidence
  }: {
    keywordHit: boolean;
    entityHit: boolean;
    label: 'on_topic' | 'off_topic' | 'uncertain';
    confidence: number;
  }): boolean {
    if (keywordHit || entityHit) return false;
    if (label === 'on_topic') return false;
    if (
      label === 'off_topic' &&
      confidence >= INTENT_HARD_BLOCK_CONFIDENCE_THRESHOLD
    ) {
      return true;
    }
    return false;
  }

  /*
  public async chat({
    conversationId: initialConversationId,
    message,
    userId,
    userCurrency
  }: {
    conversationId?: string;
    message: string;
    userId: string;
    userCurrency: string;
  }): Promise<{ text: string; conversationId: string }> {
    const conversationId =
      initialConversationId?.trim() ||
      this.conversationMemoryService.createConversationId();

    const apiKeyFromEnv = this.configurationService.get('API_KEY_OPENROUTER');
    const apiKeyFromStore = await this.propertyService.getByKey<string>(
      PROPERTY_API_KEY_OPENROUTER
    );
    const apiKey = (apiKeyFromEnv?.trim() || apiKeyFromStore?.trim()) ?? '';

    const modelFromEnv = this.configurationService.get('OPENROUTER_MODEL');
    const modelFromStore = await this.propertyService.getByKey<string>(
      PROPERTY_OPENROUTER_MODEL
    );
    const model =
      modelFromEnv?.trim() ||
      modelFromStore?.trim() ||
      DEFAULT_OPENROUTER_MODEL;

    if (!apiKey) {
      throw new Error(
        'OpenRouter API key is not configured. Set API_KEY_OPENROUTER in .env or in the property store.'
      );
    }

    const llmForIntent = new ChatOpenAI({
      modelName: model as string,
      openAIApiKey: apiKey,
      temperature: 0,
      configuration: {
        basePath: 'https://openrouter.ai/api/v1'
      }
    });

    // Intent check: include recent conversation context so follow-ups (e.g. "what about last month?") are classified correctly
    const intentHistory = await this.conversationMemoryService.getHistory(
      conversationId,
      userId,
      INTENT_CONTEXT_MESSAGE_LIMIT
    );
    this.logger.debug(
      `Intent check: conversationId=${conversationId} fromRequest=${!!initialConversationId?.trim()} historyMessages=${intentHistory.length}`
    );
    const intentResponse = await llmForIntent.invoke([
      new SystemMessage(INTENT_SYSTEM_PROMPT),
      ...intentHistory,
      new HumanMessage(message)
    ]);
    const intentText =
      typeof intentResponse.content === 'string'
        ? intentResponse.content
        : Array.isArray(intentResponse.content)
          ? (intentResponse.content as { type?: string; text?: string }[])
              .map((c) => (c && 'text' in c ? c.text : String(c)))
              .join('')
          : String(intentResponse.content ?? '');
    const isOffTopic = this.isOffTopicIntent(intentText);
    if (isOffTopic) {
      return { text: OFF_TOPIC_MESSAGE, conversationId };
    }

    const llm = new ChatOpenAI({
      modelName: model as string,
      openAIApiKey: apiKey,
      temperature: 0.2,
      configuration: {
        basePath: 'https://openrouter.ai/api/v1'
      }
    });

    const tools = getGauntletTools(
      this.portfolioService,
      this.orderService,
      this.dataProviderService,
      userId,
      userCurrency
    );
    const modelWithTools = llm.bindTools(tools);

    const history = await this.conversationMemoryService.getHistory(
      conversationId,
      userId
    );
    const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
      new SystemMessage(SYSTEM_PROMPT),
      ...history,
      new HumanMessage(message)
    ];

    let response: AIMessage = await modelWithTools.invoke(messages);
    const maxToolRounds = 5;
    let round = 0;

    while (
      response.tool_calls &&
      response.tool_calls.length > 0 &&
      round < maxToolRounds
    ) {
      const toolResults: ToolMessage[] = [];
      for (const tc of response.tool_calls) {
        const tool = tools.find((t) => t.name === tc.name);
        const args =
          typeof tc.args === 'string' ? JSON.parse(tc.args || '{}') : tc.args ?? {};
        // DynamicTool expects string input; pass JSON string for market_historical to avoid schema validation error
        const toolInput =
          tc.name === 'market_historical'
            ? JSON.stringify(args)
            : args;
        let content: string;
        if (tool && typeof (tool as { invoke?: (input: unknown) => Promise<string> }).invoke === 'function') {
          content = await (tool as { invoke: (input: unknown) => Promise<string> }).invoke(toolInput);
        } else {
          content = 'Tool not found or not invokable.';
        }
        toolResults.push(
          new ToolMessage({
            content,
            tool_call_id: tc.id
          })
        );
      }
      messages.push(response, ...toolResults);
      response = await modelWithTools.invoke(messages);
      round += 1;
    }

    const text =
      typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? (response.content as { type?: string; text?: string }[])
              .map((c) => (c && 'text' in c ? c.text : String(c)))
              .join('')
          : String(response.content ?? '');

    const finalText = text.trim() || 'I could not generate a response.';
    await this.conversationMemoryService.appendTurn(
      conversationId,
      userId,
      message,
      finalText
    );
    return { text: finalText, conversationId };
  }
  */

  /**
   * Same as chat() but streams the final assistant reply token-by-token.
   * Yields { conversationId } first, then content chunks. Off-topic and static messages are yielded as a single chunk.
   */
  public async *chatStream({
    conversationId: initialConversationId,
    message,
    userId,
    userCurrency
  }: {
    conversationId?: string;
    message: string;
    userId: string;
    userCurrency: string;
  }): AsyncGenerator<string | { conversationId: string }> {
    const conversationId =
      initialConversationId?.trim() ||
      this.conversationMemoryService.createConversationId();

    const apiKeyFromEnv = this.configurationService.get('API_KEY_OPENROUTER');
    const apiKeyFromStore = await this.propertyService.getByKey<string>(
      PROPERTY_API_KEY_OPENROUTER
    );
    const apiKey = (apiKeyFromEnv?.trim() || apiKeyFromStore?.trim()) ?? '';

    const modelFromEnv = this.configurationService.get('OPENROUTER_MODEL');
    const modelFromStore = await this.propertyService.getByKey<string>(
      PROPERTY_OPENROUTER_MODEL
    );
    const model =
      modelFromEnv?.trim() ||
      modelFromStore?.trim() ||
      DEFAULT_OPENROUTER_MODEL;

    if (!apiKey) {
      yield `Error: OpenRouter API key is not configured. Set API_KEY_OPENROUTER in .env or in the property store.`;
      return;
    }

    yield { conversationId };

    const llmForIntent = new ChatOpenAI({
      modelName: model as string,
      openAIApiKey: apiKey,
      temperature: 0,
      configuration: {
        basePath: 'https://openrouter.ai/api/v1'
      }
    });

    const intentHistory = await this.conversationMemoryService.getHistory(
      conversationId,
      userId,
      INTENT_CONTEXT_MESSAGE_LIMIT
    );
    const intentState = await this.conversationMemoryService.getIntentState(
      conversationId,
      userId
    );
    const intentHistoryPreview = intentHistory
      .map((historyMessage, index) => {
        const type =
          typeof historyMessage.getType === 'function'
            ? historyMessage.getType()
            : 'unknown';
        const content = this.toTextContent(
          (historyMessage as { content?: unknown }).content
        );
        const compactContent = this.normalizeCompact(content, 120);
        return `#${index}:${type}:${compactContent}`;
      })
      .join(' | ');
    const intentInput = this.buildIntentInput({
      message,
      intentHistory: intentHistory as (HumanMessage | AIMessage | SystemMessage | ToolMessage)[],
      lastIntent: intentState.lastIntent,
      lastToolUsed: intentState.lastToolUsed,
      recentEntities: intentState.recentEntities
    });
    this.logger.debug(
      `Intent check (stream): conversationId=${conversationId} fromRequest=${!!initialConversationId?.trim()} historyMessages=${intentHistory.length}`
    );
    this.logger.debug(
      `Intent history preview (stream): ${intentHistoryPreview || '<empty>'}`
    );
    let intentResponse = await llmForIntent.invoke([
      new SystemMessage(INTENT_SYSTEM_PROMPT),
      new HumanMessage(intentInput)
    ]);
    let intentText = this.toTextContent(intentResponse.content);
    let intentClassification = this.parseIntentClassification(intentText);
    const keywordHit = this.hasDomainKeyword(message);
    const entityHit = this.hasMarketEntityHint(message, intentState.recentEntities);
    const shortFollowUpOverride =
      this.isLikelyFollowUp(message) &&
      intentState.lastIntent === 'on_topic' &&
      !this.hasOutOfDomainSignal(message);
    const nearThresholdOffTopic =
      intentClassification.label === 'off_topic' &&
      intentClassification.confidence >= INTENT_SECOND_CHANCE_MIN_CONFIDENCE &&
      intentClassification.confidence < INTENT_HARD_BLOCK_CONFIDENCE_THRESHOLD;
    let secondChanceUsed = false;
    if (
      !keywordHit &&
      !entityHit &&
      !shortFollowUpOverride &&
      (intentClassification.label === 'uncertain' || nearThresholdOffTopic)
    ) {
      secondChanceUsed = true;
      intentResponse = await llmForIntent.invoke([
        new SystemMessage(INTENT_SECOND_CHANCE_SYSTEM_PROMPT),
        new HumanMessage(intentInput)
      ]);
      intentText = this.toTextContent(intentResponse.content);
      intentClassification = this.parseIntentClassification(intentText);
    }
    const isOffTopic = this.shouldTreatAsOffTopic({
      keywordHit,
      entityHit: entityHit || shortFollowUpOverride,
      label: intentClassification.label,
      confidence: intentClassification.confidence
    });
    const shouldAskClarification =
      !isOffTopic &&
      !keywordHit &&
      !entityHit &&
      !shortFollowUpOverride &&
      (intentClassification.label === 'uncertain' ||
        (intentClassification.label === 'off_topic' &&
          intentClassification.confidence >= INTENT_OFF_TOPIC_CONFIDENCE_THRESHOLD));
    this.logger.debug(
      `Intent gate (stream): label=${intentClassification.label} confidence=${intentClassification.confidence.toFixed(2)} keywordHit=${keywordHit} entityHit=${entityHit} shortFollowUpOverride=${shortFollowUpOverride} secondChance=${secondChanceUsed} decision=${isOffTopic ? 'off_topic' : shouldAskClarification ? 'clarify' : 'on_topic'} reason=${intentClassification.reason}`
    );
    if (shouldAskClarification) {
      await this.conversationMemoryService.updateIntentState(conversationId, userId, {
        lastIntent: 'uncertain',
        pendingClarification: true
      });
      yield this.buildClarificationQuestion({
        lastToolUsed: intentState.lastToolUsed,
        recentEntities: intentState.recentEntities
      });
      return;
    }
    if (isOffTopic) {
      await this.conversationMemoryService.updateIntentState(conversationId, userId, {
        lastIntent: 'off_topic',
        pendingClarification: false
      });
      yield OFF_TOPIC_MESSAGE;
      return;
    }

    const llm = new ChatOpenAI({
      modelName: model as string,
      openAIApiKey: apiKey,
      temperature: 0.2,
      configuration: {
        basePath: 'https://openrouter.ai/api/v1'
      }
    });

    const tools = getGauntletTools(
      this.portfolioService,
      this.orderService,
      this.dataProviderService,
      userId,
      userCurrency
    );
    const modelWithTools = llm.bindTools(tools);

    const history = await this.conversationMemoryService.getHistory(
      conversationId,
      userId
    );
    const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
      new SystemMessage(SYSTEM_PROMPT),
      ...history,
      new HumanMessage(message)
    ];

    const maxToolRounds = 5;
    let round = 0;
    let accumulated: AIMessageChunk = new AIMessageChunk({ content: '' });
    const invokedToolNames: string[] = [];
    const toolOutputSnippets: string[] = [];

    while (round < maxToolRounds) {
      const stream = await modelWithTools.stream(messages);
      accumulated = new AIMessageChunk({ content: '' });

      for await (const chunk of stream) {
        const c = chunk as AIMessageChunk;
        accumulated = accumulated.concat(c);
        const content = c.content;
        if (typeof content === 'string' && content) {
          yield content;
        } else if (Array.isArray(content)) {
          const text = content
            .filter((part): part is { type: string; text?: string } => part && typeof part === 'object' && 'text' in part)
            .map((part) => part.text ?? '')
            .join('');
          if (text) yield text;
        }
      }

      const response = new AIMessage({
        content: accumulated.content,
        tool_calls: accumulated.tool_calls,
        invalid_tool_calls: accumulated.invalid_tool_calls
      });

      if (
        !response.tool_calls ||
        response.tool_calls.length === 0
      ) {
        const text =
          typeof accumulated.content === 'string'
            ? accumulated.content
            : Array.isArray(accumulated.content)
              ? (accumulated.content as { type?: string; text?: string }[])
                  .map((c) => (c && 'text' in c ? c.text : String(c)))
                  .join('')
              : String(accumulated.content ?? '');
        const final = text.trim() || 'I could not generate a response.';
        await this.conversationMemoryService.appendTurn(
          conversationId,
          userId,
          message,
          final
        );
        const lastToolUsed =
          invokedToolNames.length > 0
            ? invokedToolNames[invokedToolNames.length - 1]
            : intentState.lastToolUsed;
        const extractedEntities = this.extractEntitiesFromText(
          [message, final, ...toolOutputSnippets].join('\n')
        );
        await this.conversationMemoryService.updateIntentState(conversationId, userId, {
          lastIntent: 'on_topic',
          lastToolUsed,
          recentEntities: extractedEntities,
          pendingClarification: false
        });
        return;
      }

      const toolResults: ToolMessage[] = [];
      for (const tc of response.tool_calls) {
        invokedToolNames.push(tc.name);
        const tool = tools.find((t) => t.name === tc.name);
        const parsedArgs =
          typeof tc.args === 'string' ? JSON.parse(tc.args || '{}') : tc.args ?? {};
        const args =
          tc.name === 'market_historical'
            ? this.hydrateMarketHistoricalArgs(parsedArgs, message, history)
            : parsedArgs;
        const toolInput =
          tc.name === 'market_historical'
            ? JSON.stringify(args)
            : args;
        let content: string;
        if (tool && typeof (tool as { invoke?: (input: unknown) => Promise<string> }).invoke === 'function') {
          content = await (tool as { invoke: (input: unknown) => Promise<string> }).invoke(toolInput);
        } else {
          content = 'Tool not found or not invokable.';
        }
        if (tc.name === 'market_historical') {
          const clarification = this.buildMarketHistoricalArgumentQuestion(content, args);
          if (clarification) {
            await this.conversationMemoryService.appendTurn(
              conversationId,
              userId,
              message,
              clarification
            );
            const extractedEntities = this.extractEntitiesFromText(
              [message, clarification, content].join('\n')
            );
            await this.conversationMemoryService.updateIntentState(
              conversationId,
              userId,
              {
                lastIntent: 'uncertain',
                lastToolUsed: 'market_historical',
                recentEntities: extractedEntities,
                pendingClarification: true
              }
            );
            yield clarification;
            return;
          }
        }
        toolOutputSnippets.push(this.normalizeCompact(content, 240));
        toolResults.push(
          new ToolMessage({
            content,
            tool_call_id: tc.id
          })
        );
      }
      messages.push(response, ...toolResults);
      round += 1;
    }

    const text =
      typeof accumulated.content === 'string'
        ? accumulated.content
        : Array.isArray(accumulated.content)
          ? (accumulated.content as { type?: string; text?: string }[])
              .map((c) => (c && 'text' in c ? c.text : String(c)))
              .join('')
          : String(accumulated.content ?? '');
    const final = text.trim() || 'I could not generate a response.';
    await this.conversationMemoryService.appendTurn(
      conversationId,
      userId,
      message,
      final
    );
    const lastToolUsed =
      invokedToolNames.length > 0
        ? invokedToolNames[invokedToolNames.length - 1]
        : intentState.lastToolUsed;
    const extractedEntities = this.extractEntitiesFromText(
      [message, final, ...toolOutputSnippets].join('\n')
    );
    await this.conversationMemoryService.updateIntentState(conversationId, userId, {
      lastIntent: 'on_topic',
      lastToolUsed,
      recentEntities: extractedEntities,
      pendingClarification: false
    });
    if (final) yield final;
  }
}
