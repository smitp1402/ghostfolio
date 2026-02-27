/** Stored message shape for Redis; maps to LangChain HumanMessage / AIMessage. */
export interface StoredMessage {
  type: 'human' | 'ai';
  content: string;
}

/** Conversation history as stored in Redis. */
export type ConversationHistory = StoredMessage[];
