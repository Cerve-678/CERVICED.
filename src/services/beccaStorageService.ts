import { supabase } from '../lib/supabase';
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

const beccaStorageService = {
  async loadSessions(userId: string, hat: BeccaHat): Promise<StoredSession[]> {
    const { data, error } = await supabase
      .from('becca_chat_sessions')
      .select('id, title, preview, hat, created_at, updated_at')
      .eq('user_id', userId)
      .eq('hat', hat)
      .order('updated_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return data ?? [];
  },

  async loadMessages(sessionId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('becca_chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
      timestamp: new Date(row.created_at),
      imageUri: row.image_uri ?? undefined,
      ...(row.metadata ?? {}),
    }));
  },

  async createSession(
    userId: string,
    title: string,
    preview: string,
    hat: BeccaHat,
  ): Promise<string> {
    const { data, error } = await supabase
      .from('becca_chat_sessions')
      .insert({ user_id: userId, title, preview, hat })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  },

  async updateSession(sessionId: string, title: string, preview: string): Promise<void> {
    await supabase
      .from('becca_chat_sessions')
      .update({ title, preview, updated_at: new Date().toISOString() })
      .eq('id', sessionId);
  },

  async saveMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const { suggestions, providerRecommendations, imageUri, ..._ } = message as any;
    const metadata: Record<string, any> = {};
    if (suggestions) metadata['suggestions'] = suggestions;
    if (providerRecommendations) metadata['providerRecommendations'] = providerRecommendations;

    await supabase.from('becca_chat_messages').upsert({
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
    const { error } = await supabase
      .from('becca_chat_sessions')
      .delete()
      .eq('id', sessionId);
    if (error) throw error;
  },

  /**
   * Deletes every session for one hat only — clearing business chats must
   * never touch the user's beauty chats, and vice versa. Messages go with
   * them via becca_chat_messages' ON DELETE CASCADE.
   */
  async clearSessions(userId: string, hat: BeccaHat): Promise<void> {
    const { error } = await supabase
      .from('becca_chat_sessions')
      .delete()
      .eq('user_id', userId)
      .eq('hat', hat);
    if (error) throw error;
  },
};

export default beccaStorageService;
