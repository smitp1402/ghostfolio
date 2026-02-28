/** Stored message shape for Redis; maps to LangChain HumanMessage / AIMessage. */
export interface StoredMessage {
  type: 'human' | 'ai';
  content: string;
}

/** Conversation history as stored in Redis. */
export type ConversationHistory = StoredMessage[];

export type IntentLabel = 'on_topic' | 'off_topic' | 'uncertain';

/** Small session state used by intent gating. */
export interface ConversationIntentState {
  lastIntent: IntentLabel;
  lastToolUsed?: string;
  recentEntities: string[];
  pendingClarification: boolean;
  updatedAt: string;
}
