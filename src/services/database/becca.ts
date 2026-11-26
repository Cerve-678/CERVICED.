// Database access: Becca chat sessions and messages.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import type { MissRecord as BeccaMissRecord } from "../becca/missLog";
import { supabase } from "../../lib/supabase";

// ─────────────────────────────────────────────────────────
// BECCA — chat sessions & messages
// ─────────────────────────────────────────────────────────
// Every query here is scoped by `hat`. A user with both hats has two separate
// assistants answering from different data, so their histories are separate
// lists — a provider must never see their client-side chats in their business
// history, and clearing one hat must never touch the other.

export type BeccaChatHat = "client" | "provider";

export interface DbBeccaSession {
  id: string;
  title: string;
  preview: string;
  hat: BeccaChatHat;
  created_at: string;
  updated_at: string;
}

export interface DbBeccaMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  image_uri: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Most recent chat sessions for one user, for one hat only. */
export async function getBeccaSessions(
  userId: string,
  hat: BeccaChatHat,
): Promise<DbBeccaSession[]> {
  const { data, error } = await supabase
    .from("becca_chat_sessions")
    .select("id, title, preview, hat, created_at, updated_at")
    .eq("user_id", userId)
    .eq("hat", hat)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as DbBeccaSession[];
}

/** Messages in one session, oldest first. Same shape as
 *  getConversationMessages: capped and fetched newest-first, then reversed,
 *  so a long-running conversation can't pull its entire unbounded history on
 *  every session reopen. */
export async function getBeccaMessages(
  sessionId: string,
  limit = 200,
): Promise<DbBeccaMessage[]> {
  const { data, error } = await supabase
    .from("becca_chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(Math.trunc(limit), 1), 200));
  if (error) throw error;
  return ((data ?? []) as DbBeccaMessage[]).reverse();
}

/** Create a chat session stamped with the hat that opened it. */
export async function createBeccaSession(
  userId: string,
  title: string,
  preview: string,
  hat: BeccaChatHat,
): Promise<string> {
  const { data, error } = await supabase
    .from("becca_chat_sessions")
    .insert({ user_id: userId, title, preview, hat })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Update a session's title/preview and bump its updated_at. */
export async function updateBeccaSession(
  sessionId: string,
  title: string,
  preview: string,
): Promise<void> {
  const { error } = await supabase
    .from("becca_chat_sessions")
    .update({ title, preview, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}

/** Insert or update a single message. */
export async function upsertBeccaMessage(row: DbBeccaMessage): Promise<void> {
  const { error } = await supabase.from("becca_chat_messages").upsert(row);
  if (error) throw error;
}

/**
 * Records a question Becca didn't understand, and what the person meant in
 * the end (see src/services/becca/missLog.ts). The server drops anything that
 * mentions health, blanks emails, phone numbers, postcodes and @handles, and
 * deletes rows after 90 days (record_becca_miss,
 * 20261110170000_becca_misses.sql). Signed-in callers only.
 */
export async function recordBeccaMiss(record: BeccaMissRecord): Promise<void> {
  const { error } = await supabase.rpc("record_becca_miss", {
    p_hat: record.hat,
    p_message: record.message,
    p_resolved_capability_id: record.resolvedCapabilityId,
    p_resolved_by: record.resolvedBy,
  });
  if (error) throw error;
}

/** Delete one session. Messages cascade via becca_chat_messages' FK. */
export async function deleteBeccaSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("becca_chat_sessions")
    .delete()
    .eq("id", sessionId);
  if (error) throw error;
}

/** Delete every session for ONE hat only — never the other hat's history. */
export async function clearBeccaSessions(
  userId: string,
  hat: BeccaChatHat,
): Promise<void> {
  const { error } = await supabase
    .from("becca_chat_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("hat", hat);
  if (error) throw error;
}

/**
 * Write the current user's Expo push token, but only when it actually changed.
 *
 * `registerForPushNotifications` runs on every app foreground (see AuthContext)
 * so the token can self-heal after an APNs-key rotation. Writing unconditionally
 * meant ~3.2k UPDATEs against a handful of rows, all but a few of them no-ops
 * that still cost a row version, a WAL record and autovacuum work. Reading first
 * is cheaper than the write it avoids.
 *
 * Returns true if a write actually happened.
 */
export async function setPushTokenIfChanged(
  userId: string,
  token: string | null,
): Promise<boolean> {
  const { data, error: readError } = await supabase
    .from("users")
    .select("push_token")
    .eq("id", userId)
    .maybeSingle();

  if (readError) throw readError;
  if (data?.push_token === token) return false;

  const { error: writeError } = await supabase
    .from("users")
    .update({ push_token: token })
    .eq("id", userId);

  if (writeError) throw writeError;
  return true;
}
