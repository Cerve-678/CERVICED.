import {
  getBeccaSessions,
  getBeccaMessages,
  createBeccaSession,
  updateBeccaSession,
  upsertBeccaMessage,
  deleteBeccaSession,
  clearBeccaSessions,
} from './databaseService';
import { ChatMessage } from './becca/types';

/**
 * Which Becca a session belongs to. A user with both hats has two separate
 * assistants answering from different data, so their chat histories are
 * separate lists — a provider must never see their client-side chats in their
 * business history.
 */
export type BeccaHat = 'client' | 'provider';

export interface StoredSession {
  id: string;
  title: string;
  preview: string;
  hat: BeccaHat;
  created_at: string;
  updated_at: string;
}

/**
 * Maps between Becca's chat types and the persistence layer. All Supabase
 * access lives in databaseService.ts (see CLAUDE.md's access-boundary rule) —
 * this file only shapes rows into ChatMessage/StoredSession and back.
 */
const beccaStorageService = {
  async loadSessions(userId: string, hat: BeccaHat): Promise<StoredSession[]> {
    return (await getBeccaSessions(userId, hat)) as StoredSession[];
  },

  async loadMessages(sessionId: string): Promise<ChatMessage[]> {
    const rows = await getBeccaMessages(sessionId);
    // imageUri is spread conditionally rather than set to undefined: the repo
    // compiles with exactOptionalPropertyTypes, so an explicit `undefined` is
    // not assignable to an optional string.
    return rows.map((row) => ({
      id: row.id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
      timestamp: new Date(row.created_at),
      ...(row.image_uri ? { imageUri: row.image_uri } : {}),
      ...(row.metadata ?? {}),
    }));
  },

  async createSession(
    userId: string,
    title: string,
    preview: string,
    hat: BeccaHat,
  ): Promise<string> {
    return createBeccaSession(userId, title, preview, hat);
  },

  async updateSession(sessionId: string, title: string, preview: string): Promise<void> {
    await updateBeccaSession(sessionId, title, preview);
  },

  async saveMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const { suggestions, providerRecommendations } = message as any;
    const metadata: Record<string, any> = {};
    if (suggestions) metadata['suggestions'] = suggestions;
    if (providerRecommendations) metadata['providerRecommendations'] = providerRecommendations;

    await upsertBeccaMessage({
      id: message.id,
      session_id: sessionId,
      role: message.role,
      content: message.content,
      image_uri: message.imageUri ?? null,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      created_at: message.timestamp.toISOString(),
    });
  },

  async deleteSession(sessionId: string): Promise<void> {
    await deleteBeccaSession(sessionId);
  },

  /**
   * Deletes every session for one hat only — clearing business chats must
   * never touch the user's beauty chats, and vice versa. Messages go with
   * them via becca_chat_messages' ON DELETE CASCADE.
   */
  async clearSessions(userId: string, hat: BeccaHat): Promise<void> {
    await clearBeccaSessions(userId, hat);
  },
};

export default beccaStorageService;
