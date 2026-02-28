import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';

import { Injectable, Logger } from '@nestjs/common';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import ms from 'ms';
import { randomUUID } from 'node:crypto';

import type {
  ConversationHistory,
  ConversationIntentState,
  IntentLabel,
  StoredMessage
} from './conversation-memory.interface';

const CONVERSATION_KEY_PREFIX = 'gauntlet:conversation:';
const INTENT_STATE_KEY_PREFIX = 'gauntlet:intent-state:';
const DEFAULT_MAX_HISTORY_MESSAGES = 20;
const DEFAULT_MAX_STORED_MESSAGES = 50;
const DEFAULT_MAX_RECENT_ENTITIES = 20;
const DEFAULT_TTL_MS = ms('7 days');

@Injectable()
export class ConversationMemoryService {
  private readonly logger = new Logger(ConversationMemoryService.name);

  public constructor(
    private readonly redisCacheService: RedisCacheService,
    private readonly configurationService: ConfigurationService
  ) {}

  private getKey(userId: string, conversationId: string): string {
    return `${CONVERSATION_KEY_PREFIX}${userId}:${conversationId}`;
  }

  private getIntentStateKey(userId: string, conversationId: string): string {
    return `${INTENT_STATE_KEY_PREFIX}${userId}:${conversationId}`;
  }

  private toTtlMs(ttlMs?: number): number {
    const ttlRaw = ttlMs ?? this.configurationService.get('GAUNTLET_CONVERSATION_TTL_MS');
    return ttlRaw != null
      ? typeof ttlRaw === 'number'
        ? ttlRaw
        : Number(ttlRaw) || (ms as (s: string) => number)(String(ttlRaw))
      : DEFAULT_TTL_MS;
  }

  private defaultIntentState(): ConversationIntentState {
    return {
      lastIntent: 'uncertain',
      recentEntities: [],
      pendingClarification: false,
      updatedAt: new Date(0).toISOString()
    };
  }

  private parseIntentState(raw: unknown): ConversationIntentState {
    if (raw == null) return this.defaultIntentState();
    const fromRaw =
      typeof raw === 'string'
        ? (() => {
            try {
              return JSON.parse(raw) as unknown;
            } catch {
              return null;
            }
          })()
        : raw;
    if (!fromRaw || typeof fromRaw !== 'object') return this.defaultIntentState();
    const candidate = fromRaw as Partial<ConversationIntentState>;
    const lastIntent =
      candidate.lastIntent === 'on_topic' ||
      candidate.lastIntent === 'off_topic' ||
      candidate.lastIntent === 'uncertain'
        ? candidate.lastIntent
        : 'uncertain';
    const lastToolUsed =
      typeof candidate.lastToolUsed === 'string' && candidate.lastToolUsed.trim()
        ? candidate.lastToolUsed.trim()
        : undefined;
    const pendingClarification = Boolean(candidate.pendingClarification);
    const updatedAt =
      typeof candidate.updatedAt === 'string' && candidate.updatedAt
        ? candidate.updatedAt
        : new Date(0).toISOString();
    const recentEntities = Array.isArray(candidate.recentEntities)
      ? candidate.recentEntities
          .filter((entity): entity is string => typeof entity === 'string')
          .map((entity) => entity.trim())
          .filter(Boolean)
          .slice(-DEFAULT_MAX_RECENT_ENTITIES)
      : [];
    return {
      lastIntent,
      lastToolUsed,
      recentEntities,
      pendingClarification,
      updatedAt
    };
  }

  private parseStored(raw: string | ConversationHistory | null): StoredMessage[] {
    if (raw == null) return [];
    if (Array.isArray(raw)) {
      const valid = raw.every(
        (m) =>
          m &&
          typeof m === 'object' &&
          (m.type === 'human' || m.type === 'ai') &&
          typeof m.content === 'string'
      );
      if (!valid && raw.length > 0) {
        this.logger.warn(
          `parseStored: invalid array shape (length=${raw.length}), discarding`
        );
      }
      return valid ? (raw as StoredMessage[]) : [];
    }
    if (typeof raw !== 'string') {
      this.logger.warn(
        `parseStored: unexpected type ${typeof raw}, expected string or array`
      );
      return [];
    }
    try {
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr) ? (arr as StoredMessage[]) : [];
    } catch (e) {
      this.logger.warn(`parseStored: JSON parse failed`, (e as Error)?.message);
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
    const rawType = raw == null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw;
    const stored = this.parseStored(raw as string | ConversationHistory | null);
    const trimmed = stored.slice(-limit);
    this.logger.debug(
      `getHistory key=${key} rawType=${rawType} stored=${stored.length} trimmed=${trimmed.length}`
    );
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
    const beforeCount = stored.length;
    stored.push({ type: 'human', content: humanContent });
    stored.push({ type: 'ai', content: assistantContent });
    const maxStored =
      this.configurationService.get('GAUNTLET_MAX_STORED_MESSAGES') ??
      DEFAULT_MAX_STORED_MESSAGES;
    const trimmed = stored.slice(-maxStored);
    const ttl = this.toTtlMs(ttlMs);
    await this.redisCacheService.set(key, JSON.stringify(trimmed), ttl);
    this.logger.log(
      `appendTurn key=${key} before=${beforeCount} after=${trimmed.length} ttlMs=${ttl} humanLen=${humanContent.length} assistantLen=${assistantContent.length}`
    );
  }

  public async getIntentState(
    conversationId: string,
    userId: string
  ): Promise<ConversationIntentState> {
    const key = this.getIntentStateKey(userId, conversationId);
    const raw = await this.redisCacheService.get(key);
    const parsed = this.parseIntentState(raw);
    return parsed;
  }

  public async updateIntentState(
    conversationId: string,
    userId: string,
    patch: Partial<ConversationIntentState> & { lastIntent?: IntentLabel },
    ttlMs?: number
  ): Promise<ConversationIntentState> {
    const key = this.getIntentStateKey(userId, conversationId);
    const current = await this.getIntentState(conversationId, userId);
    const mergedEntities = [
      ...(Array.isArray(current.recentEntities) ? current.recentEntities : []),
      ...(Array.isArray(patch.recentEntities) ? patch.recentEntities : [])
    ]
      .map((entity) => String(entity).trim())
      .filter(Boolean);
    const uniqueEntities = Array.from(new Set(mergedEntities)).slice(
      -DEFAULT_MAX_RECENT_ENTITIES
    );
    const next: ConversationIntentState = {
      ...current,
      ...patch,
      recentEntities: uniqueEntities,
      pendingClarification:
        patch.pendingClarification ?? current.pendingClarification ?? false,
      updatedAt: new Date().toISOString()
    };
    await this.redisCacheService.set(key, JSON.stringify(next), this.toTtlMs(ttlMs));
    return next;
  }

  public createConversationId(): string {
    return randomUUID();
  }
}
