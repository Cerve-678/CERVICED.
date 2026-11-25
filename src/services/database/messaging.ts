// Database access: Provider conversations and messages.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { clearCachedReads, supabase } from "../../lib/supabase";

// ─────────────────────────────────────────────────────────
// PROVIDER CONVERSATIONS & MESSAGES
// ─────────────────────────────────────────────────────────

export interface DbProviderMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: "user" | "provider";
  content: string;
  created_at: string;
  read_at: string | null;
}

/** Find an existing conversation or create one. Returns the conversation ID. */
export async function getOrCreateConversation(
  providerId: string,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc(
    "get_or_create_provider_conversation",
    {
      p_provider_id: providerId,
      p_user_id: userId,
    },
  );
  if (error || !data) throw error ?? new Error("Could not create conversation");
  return data as string;
}

/** Clear the provider's unread badge for a conversation */
export async function markConversationReadByProvider(
  conversationId: string,
): Promise<void> {
  const { error } = await supabase.rpc("mark_conversation_read_by_provider", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
}

/** Clear the client/user's unread badge for a conversation */
export async function markConversationReadByUser(
  conversationId: string,
): Promise<void> {
  const { error } = await supabase.rpc("mark_conversation_read_by_user", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
}

/** Fetch the most recent bounded message window, returned oldest first. */
export async function getConversationMessages(
  conversationId: string,
  limit = 200,
): Promise<DbProviderMessage[]> {
  const { data, error } = await supabase
    .from("provider_messages")
    .select("id, conversation_id, sender_id, sender_type, content, created_at, read_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(Math.trunc(limit), 1), 200));
  if (error) throw error;
  return ((data ?? []) as DbProviderMessage[]).reverse();
}

/** Realtime inserts for one conversation; caller owns cleanup. */
export function subscribeToConversationMessages(
  conversationId: string,
  onInsert: (message: DbProviderMessage) => void,
): () => void {
  const channel = supabase
    .channel(`conversation-messages-${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "provider_messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        clearCachedReads();
        onInsert(payload.new as DbProviderMessage);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Insert a new message into a conversation */
export async function sendProviderMessage(params: {
  conversationId: string;
  /** Retained for existing call sites; the database derives the real sender. */
  senderId: string;
  senderType: "provider" | "user";
  content: string;
}): Promise<DbProviderMessage> {
  const { data, error } = await supabase
    .rpc("send_provider_conversation_message", {
      p_conversation_id: params.conversationId,
      p_content: params.content,
    })
    .single();
  if (error) throw error;
  return data as DbProviderMessage;
}

/** Update the inbox preview after a message has been accepted by RLS. The
 * database RPC independently verifies that the caller is the stated sender. */
export async function updateConversationLastMessage(params: {
  conversationId: string;
  message: string;
  senderType: "provider" | "user";
}): Promise<void> {
  // Kept as a compatibility no-op while older screens transition. The send
  // RPC above updates the preview and recipient unread counter atomically.
  void params;
}

/** Send a provider reply and update the conversation's last-message preview
 *  in one call — the same two-step sequence ProviderConversationScreen uses
 *  (insert, then the non-fatal update_conversation_last_message RPC), bundled
 *  here so callers like the inbox quick-reply don't need a raw supabase.rpc()
 *  of their own. */
export async function sendConversationQuickReply(params: {
  conversationId: string;
  senderId: string;
  content: string;
}): Promise<DbProviderMessage> {
  const inserted = await sendProviderMessage({
    conversationId: params.conversationId,
    senderId: params.senderId,
    senderType: "provider",
    content: params.content,
  });
  updateConversationLastMessage({
    conversationId: params.conversationId,
    message: params.content,
    senderType: "provider",
  }).catch(() => {});
  return inserted;
}

/** Whether the signed-in person has blocked the other person in this chat. */
export async function getConversationBlockState(conversationId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("get_conversation_block_state", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return data === true;
}

/** Blocks or unblocks the other person in this chat. Uses the same block list
 *  as Circle, and while it's on neither side can send a message. */
export async function setConversationBlock(conversationId: string, blocked: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_conversation_block", {
    p_conversation_id: conversationId,
    p_blocked: blocked,
  });
  if (error) throw error;
}
