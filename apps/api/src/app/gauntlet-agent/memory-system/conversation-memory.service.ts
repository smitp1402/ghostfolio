import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';

import { Injectable } from '@nestjs/common';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import ms from 'ms';
import { randomUUID } from 'node:crypto';

import type { ConversationHistory, StoredMessage } from './conversation-memory.interface';

const CONVERSATION_KEY_PREFIX = 'gauntlet:conversation:';
const DEFAULT_MAX_HISTORY_MESSAGES = 20;
const DEFAULT_MAX_STORED_MESSAGES = 50;
const DEFAULT_TTL_MS = ms('7 days');

@Injectable()
export class ConversationMemoryService {
  public constructor(
    private readonly redisCacheService: RedisCacheService,
    private readonly configurationService: ConfigurationService
  ) {}

  private getKey(userId: string, conversationId: string): string {
    return `${CONVERSATION_KEY_PREFIX}${userId}:${conversationId}`;
  }

  private parseStored(raw: string | ConversationHistory | null): StoredMessage[] {
    if (raw == null) return [];
    if (Array.isArray(raw)) {
      return raw.every(
        (m) =>
          m &&
          typeof m === 'object' &&
          (m.type === 'human' || m.type === 'ai') &&
          typeof m.content === 'string'
      )
        ? (raw as StoredMessage[])
        : [];
    }
    if (typeof raw !== 'string') return [];
    try {
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr) ? (arr as StoredMessage[]) : [];
    } catch {
      return [];
    }
  }

  private toBaseMessages(stored: StoredMessage[]): BaseMessage[] {
    return stored.map((m) =>
      m.type === 'human'
        ? new HumanMessage(m.content)
        : new AIMessage(m.content)
    );
  }

  /**
   * Returns the last `limit` messages for the conversation as LangChain BaseMessage[].
   * Returns [] if key missing or invalid.
   */
  public async getHistory(
    conversationId: string,
    userId: string,
    limit: number = DEFAULT_MAX_HISTORY_MESSAGES
  ): Promise<BaseMessage[]> {
    const key = this.getKey(userId, conversationId);
    const raw = await this.redisCacheService.get(key);
    const stored = this.parseStored(raw as string | ConversationHistory | null);
    const trimmed = stored.slice(-limit);
    return this.toBaseMessages(trimmed);
  }

  /**
   * Appends one user turn and one assistant turn, trims to max length, and sets with TTL.
   */
  public async appendTurn(
    conversationId: string,
    userId: string,
    humanContent: string,
    assistantContent: string,
    ttlMs?: number
  ): Promise<void> {
    const key = this.getKey(userId, conversationId);
    const raw = await this.redisCacheService.get(key);
    const stored = this.parseStored(raw as string | ConversationHistory | null);
    stored.push({ type: 'human', content: humanContent });
    stored.push({ type: 'ai', content: assistantContent });
    const maxStored =
      this.configurationService.get('GAUNTLET_MAX_STORED_MESSAGES') ??
      DEFAULT_MAX_STORED_MESSAGES;
    const trimmed = stored.slice(-maxStored);
    const ttlRaw = ttlMs ?? this.configurationService.get('GAUNTLET_CONVERSATION_TTL_MS');
    const ttl =
      ttlRaw != null
        ? typeof ttlRaw === 'number'
          ? ttlRaw
          : Number(ttlRaw) || (ms as (s: string) => number)(String(ttlRaw))
        : DEFAULT_TTL_MS;
    await this.redisCacheService.set(key, JSON.stringify(trimmed), ttl);
  }

  public createConversationId(): string {
    return randomUUID();
  }
}
