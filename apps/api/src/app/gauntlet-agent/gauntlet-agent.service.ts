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

/** Prompt for intent check: is the user asking about portfolio, performance, activities, market history, or report/risk/rules? */
const INTENT_SYSTEM_PROMPT = `You classify whether a user question is about their own portfolio, investments, holdings, allocation, account summary, portfolio performance over a period (e.g. "how did my portfolio perform this year?", returns, performance since max), portfolio report or rule violations or risk check (e.g. "run my portfolio report", "any rule violations?", "risk check"), transactions, orders, activities (e.g. what they bought or sold), or historical market prices for a symbol (e.g. "price of AAPL on date X") in this app. If the user's message is a short follow-up (e.g. "what about last month?", "and the year before?", "can you break that down?", "explain that") and the preceding messages in the conversation are about portfolio, performance, or other allowed topics above, reply Yes. Reply with exactly one word: Yes or No. No other text.`;

const OFF_TOPIC_MESSAGE =
  'I can only help with portfolio, activities, and market data in this app.';

const SYSTEM_PROMPT = `You are a finance-focused assistant that explains portfolio data. You only provide informational answers based on the data you retrieve. You must NOT give buy/sell advice or investment recommendations. If the user asks about their portfolio, allocation, or "how is my portfolio", use the portfolio_details tool to get the data and then summarize it in clear, natural language. If the user asks how their portfolio performed over a period (e.g. "How did my portfolio perform this year?", "Performance since max", "Returns over the last 6 months", "Performance in 2024"), use the portfolio_performance tool and summarize the results. If the user asks to run their portfolio report, check for rule violations, do a risk check, or see compliance/rule status (e.g. "Run my portfolio report", "Any rule violations?", "Risk check"), use the portfolio_report tool and summarize the results. If the user asks for recent transactions, list of orders, "what did I buy/sell?", "my activities", or similar, use the activities_list tool and summarize the results. If the user asks for the historical price of a symbol on a date or over a date range (e.g. "What was the price of AAPL on 2024-01-15?", "Historical price for BTC from X to Y"), use the market_historical tool with the symbol, dataSource (e.g. YAHOO for stocks, COINGECKO for crypto), and from/to dates in YYYY-MM-DD.`;

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
    const intentLower = intentText.trim().toLowerCase();
    const isOffTopic =
      (intentLower.includes('no') && !intentLower.includes('yes')) ||
      intentLower === 'n';
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
      userId
     
    );
    this.logger.debug(
      `Intent check (stream): conversationId=${conversationId} fromRequest=${!!initialConversationId?.trim()} historyMessages=${intentHistory.length}`
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
    const intentLower = intentText.trim().toLowerCase();
    const isOffTopic =
      (intentLower.includes('no') && !intentLower.includes('yes')) ||
      intentLower === 'n';
    if (isOffTopic) {
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
        return;
      }

      const toolResults: ToolMessage[] = [];
      for (const tc of response.tool_calls) {
        const tool = tools.find((t) => t.name === tc.name);
        const args =
          typeof tc.args === 'string' ? JSON.parse(tc.args || '{}') : tc.args ?? {};
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
    if (final) yield final;
  }
}
