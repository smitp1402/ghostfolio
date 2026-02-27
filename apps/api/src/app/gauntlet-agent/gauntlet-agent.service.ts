import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import {
  PROPERTY_API_KEY_OPENROUTER,
  PROPERTY_OPENROUTER_MODEL
} from '@ghostfolio/common/config';

import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

import { getGauntletTools } from './tools/tool.registry';

/** Default OpenRouter model when OPENROUTER_MODEL is not set in the property store. Must support tool/function calling. */
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o';

/** Prompt for intent check: is the user asking about their own portfolio/holdings/allocation? */
const INTENT_SYSTEM_PROMPT = `You classify whether a user question is about their own portfolio, investments, holdings, allocation, or account summary in this app. Reply with exactly one word: Yes or No. No other text.`;

const OFF_TOPIC_MESSAGE =
  'I can only help with questions about your portfolio. Try asking things like: "How is my portfolio?", "What\'s my allocation?", or "Give me a summary of my holdings."';

const SYSTEM_PROMPT = `You are a finance-focused assistant that explains portfolio data. You only provide informational answers based on the data you retrieve. You must NOT give buy/sell advice or investment recommendations. If the user asks about their portfolio, allocation, or "how is my portfolio", use the portfolio_details tool to get the data and then summarize it in clear, natural language.`;

@Injectable()
export class GauntletAgentService {
  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly portfolioService: PortfolioService,
    private readonly propertyService: PropertyService
  ) {}

  public async chat({
    message,
    userId
  }: {
    message: string;
    userId: string;
  }): Promise<string> {
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
      throw new Error('OpenRouter API key is not configured. Set API_KEY_OPENROUTER in .env or in the property store.');
    }

    const llmForIntent = new ChatOpenAI({
      modelName: model as string,
      openAIApiKey: apiKey,
      temperature: 0,
      configuration: {
        basePath: 'https://openrouter.ai/api/v1'
      }
    });

    // Intent check: only run full agent if the question is about the user's portfolio
    const intentResponse = await llmForIntent.invoke([
      new SystemMessage(INTENT_SYSTEM_PROMPT),
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
      return OFF_TOPIC_MESSAGE;
    }

    const llm = new ChatOpenAI({
      modelName: model as string,
      openAIApiKey: apiKey,
      temperature: 0.2,
      configuration: {
        basePath: 'https://openrouter.ai/api/v1'
      }
    });

    const tools = getGauntletTools(this.portfolioService, userId);
    const modelWithTools = llm.bindTools(tools);

    const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
      new SystemMessage(SYSTEM_PROMPT),
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
        let content: string;
        if (tool && typeof (tool as { invoke?: (input: unknown) => Promise<string> }).invoke === 'function') {
          content = await (tool as { invoke: (input: unknown) => Promise<string> }).invoke(args);
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

    return text.trim() || 'I could not generate a response.';
  }
}
