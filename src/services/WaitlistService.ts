import { supabase } from '../lib/supabase';

export interface WaitlistEntry {
  id: string;
  provider_id: string;
  user_id: string;
  service_id: string | null;
  service_name_snapshot: string;
  provider_name_snapshot: string;
  user_name_snapshot: string | null;
  preferred_dates: string[] | null;
  notes: string | null;
  status: 'waiting' | 'notified' | 'booked' | 'expired' | 'cancelled';
  position: number;
  created_at: string;
  notified_at: string | null;
  expires_at: string;
}

export interface JoinWaitlistParams {
  providerId: string;
  userId: string;
  serviceId: string | null;
  serviceNameSnapshot: string;
  providerNameSnapshot: string;
  userNameSnapshot?: string;
  preferredDates?: string[];
  notes?: string;
}

export async function joinWaitlist(params: JoinWaitlistParams): Promise<WaitlistEntry> {
  // Remove any stale row (cancelled or otherwise) so re-joining always works
  const staleQuery = supabase
    .from('provider_waitlist')
    .delete()
    .eq('provider_id', params.providerId)
    .eq('user_id', params.userId);
  if (params.serviceId) {
    await staleQuery.eq('service_id', params.serviceId);
  } else {
    await staleQuery.is('service_id', null);
  }

  const { data, error } = await supabase
    .from('provider_waitlist')
    .insert({
      provider_id: params.providerId,
      user_id: params.userId,
      service_id: params.serviceId,
      service_name_snapshot: params.serviceNameSnapshot,
      provider_name_snapshot: params.providerNameSnapshot,
      user_name_snapshot: params.userNameSnapshot ?? null,
      preferred_dates: params.preferredDates ?? null,
      notes: params.notes ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as WaitlistEntry;
}

export async function leaveWaitlist(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('provider_waitlist')
    .delete()
    .eq('id', entryId);
  if (error) throw error;
}

export async function getUserWaitlistEntries(userId: string): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase
    .from('provider_waitlist')
    .select('*')
    .eq('user_id', userId)
    .not('status', 'in', '("cancelled","booked")')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as WaitlistEntry[];
}

export async function getProviderWaitlist(providerId: string): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase
    .from('provider_waitlist')
    .select('*')
    .eq('provider_id', providerId)
    .not('status', 'in', '("cancelled","booked","expired")')
    .order('service_id', { ascending: true })
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as WaitlistEntry[];
}

export async function inviteFromWaitlist(entry: WaitlistEntry): Promise<void> {
  // Mark the entry as notified
  const { error } = await supabase
    .from('provider_waitlist')
    .update({ status: 'notified', notified_at: new Date().toISOString() })
    .eq('id', entry.id);
  if (error) throw error;

  // Send in-app notification to the user
  await supabase.from('notifications').insert({
    user_id: entry.user_id,
    type: 'waitlist_slot_available',
    title: 'A slot opened up!',
    message: `${entry.service_name_snapshot} with ${entry.provider_name_snapshot} — tap to book.`,
    priority: 'high',
    is_actionable: true,
    provider_id: entry.provider_id,
    recipient_role: 'client',
  });
}

export async function markAsBooked(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('provider_waitlist')
    .update({ status: 'booked' })
    .eq('id', entryId);
  if (error) throw error;
}

// DEPRECATED: cancellations now invite the next waiter server-side via the
// invite_next_waitlist_entry() function inside the booking status-change
// trigger (supabase/booking_flow_fixes.sql). Client-side RLS hides other
// users' waitlist rows, so calling this from the app was a silent no-op for
// client cancellations — do not wire it back in.
export async function notifyWaitlistOnCancellation(
  providerId: string,
  serviceId: string | null
): Promise<void> {
  let query = supabase
    .from('provider_waitlist')
    .select('*')
    .eq('provider_id', providerId)
    .eq('status', 'waiting')
    .order('position', { ascending: true })
    .limit(1);

  if (serviceId) {
    query = query.eq('service_id', serviceId);
  } else {
    query = query.is('service_id', null);
  }

  const { data } = await query;
  if (!data || data.length === 0) return;

  const entry = data[0] as WaitlistEntry;
  await inviteFromWaitlist(entry);
}
