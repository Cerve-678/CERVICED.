// Database access: Intake forms and the provider form library.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { bookingsHoldingForm, formProblem, type SentFormRow } from "../../features/intake-forms/sendForms";
import { supabase } from "../../lib/supabase";
import { getSessionUser } from "./account";
import { getMyProviderProfile } from "./providers";
import { sendProviderClientNotifications } from "./services";
import { mapIntakeForm } from "./providerDetails";

// ─────────────────────────────────────────────────────────
// INTAKE FORMS
// ─────────────────────────────────────────────────────────

export interface IntakeFormQuestion {
  id: string;
  type: "text" | "yesno" | "choice" | "policy";
  label: string;
  required: boolean;
  options?: string[];
  /** 'policy' questions only — the policy text itself (read-only body the
   *  client scrolls and acknowledges), distinct from `label` which stays a
   *  short heading ("Cancellation & Booking Policy"). Unused by every other
   *  type. */
  body?: string;
}

export interface IntakeForm {
  id: string;
  bookingId: string;
  providerId: string;
  clientUserId: string;
  title: string;
  questions: IntakeFormQuestion[];
  answers: Record<string, string> | null;
  status: "pending" | "completed";
  sentAt: string;
  completedAt: string | null;
  requiresSignature: boolean;
  clientSignature: string | null;
  libraryFormId: string | null;
  /** When the client should have it filled in by (null = no deadline).
   *  Stamped server-side from the saved form's deadlineHours. */
  dueAt: string | null;
}

// ── Library forms (saved to provider's form library, not yet sent) ───────────

export interface LibraryForm {
  id: string;
  providerId: string;
  title: string;
  questions: IntakeFormQuestion[];
  serviceNames: string[]; // provider's service names this form covers
  autoSend: boolean; // auto-send when matching service is booked
  requiresSignature: boolean;
  /** This form IS the provider's own Terms & Conditions — the one clients can
   *  read from the booking sheet before booking. At most one per provider
   *  (enforced by a partial unique index, not just here). */
  isTerms: boolean;
  /** Hours before the appointment the client should fill it in by
   *  (null = no deadline). See features/intake-forms/formDeadline.ts. */
  deadlineHours: number | null;
  sentCount: number;
  createdAt: string;
}

export async function getProviderFormLibrary(): Promise<LibraryForm[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];
  // Throws rather than swallowing: an empty array means "no saved forms", so
  // returning one on a failed query made the two indistinguishable. Becca's
  // pv.infopacks reads this and would tell a provider "you haven't set up any
  // forms yet" when the query had actually errored.
  const { data, error } = await supabase
    .from("provider_form_library")
    .select("*")
    .eq("provider_id", provider.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapLibraryForm);
}

/** The provider's own client-facing Terms & Conditions as editable prose. */
export async function getMyProviderTermsText(): Promise<string> {
  const provider = await getMyProviderProfile();
  if (!provider) return "";
  const { data, error } = await supabase
    .from("provider_form_library")
    .select("questions")
    .eq("provider_id", provider.id)
    .eq("is_terms", true)
    .maybeSingle();
  if (error) throw error;
  const questions = (data?.questions ?? []) as IntakeFormQuestion[];
  return questions
    .filter(question => question.type === "policy" && (question.body ?? "").trim() !== "")
    .map(question => (question.body ?? "").trim())
    .join("\n\n");
}

/** Save the one terms document clients read before booking. */
export async function saveMyProviderTermsText(body: string): Promise<void> {
  const provider = await getMyProviderProfile();
  if (!provider) throw new Error("No provider profile");
  const questions: IntakeFormQuestion[] = [
    { id: "terms", type: "policy", label: "Terms & Conditions", body: body.trim(), required: true },
  ];
  const { data: existing, error: readError } = await supabase
    .from("provider_form_library")
    .select("id")
    .eq("provider_id", provider.id)
    .eq("is_terms", true)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) {
    const { error } = await supabase
      .from("provider_form_library")
      .update({ questions, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }
  if (body.trim() === "") return;
  const { error } = await supabase.from("provider_form_library").insert({
    provider_id: provider.id,
    title: "Terms & Conditions",
    questions,
    service_names: [],
    auto_send: false,
    requires_signature: false,
    is_terms: true,
  });
  if (error) throw error;
}

/** Narrow readiness check used by the provider profile preview. */
export async function hasMyProviderTermsForm(): Promise<boolean> {
  const provider = await getMyProviderProfile();
  if (!provider) return false;
  const { data, error } = await supabase
    .from("provider_form_library")
    .select("id")
    .eq("provider_id", provider.id)
    .eq("is_terms", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** A provider's own Terms & Conditions, as a client sees them before booking.
 *
 *  Goes through the get_provider_terms RPC rather than reading
 *  provider_form_library directly: that table is owner-only by design (it also
 *  holds medical-history and patch-test forms), so the RPC is the one narrow
 *  window onto it — terms text only, and only for a live provider. Returns
 *  null when this provider hasn't written any, which is the normal case.
 *
 *  Requires supabase/migrations/20260820161251_provider_terms_and_conditions.sql
 *  to have been run.
 */
export async function getProviderTerms(
  providerId: string,
): Promise<{ title: string; body: string } | null> {
  const { data, error } = await supabase.rpc("get_provider_terms", {
    p_provider_id: providerId,
  });
  if (error) throw error;
  const row = (data as { title: string; body: string | null }[] | null)?.[0];
  if (!row?.body) return null;
  return { title: row.title, body: row.body };
}

export async function saveFormToLibrary(params: {
  title: string;
  questions: IntakeFormQuestion[];
  serviceNames: string[];
  autoSend: boolean;
  requiresSignature: boolean;
  isTerms?: boolean;
  deadlineHours?: number | null;
}): Promise<LibraryForm> {
  const provider = await getMyProviderProfile();
  if (!provider) throw new Error("No provider profile");
  const { data, error } = await supabase
    .from("provider_form_library")
    .insert({
      provider_id: provider.id,
      title: params.title,
      questions: params.questions,
      service_names: params.serviceNames,
      auto_send: params.autoSend,
      requires_signature: params.requiresSignature,
      is_terms: params.isTerms ?? false,
      deadline_hours: params.deadlineHours ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapLibraryForm(data);
}

export async function updateLibraryForm(
  id: string,
  params: Partial<{
    title: string;
    questions: IntakeFormQuestion[];
    serviceNames: string[];
    autoSend: boolean;
    requiresSignature: boolean;
    isTerms: boolean;
    deadlineHours: number | null;
  }>,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (params.title !== undefined) patch["title"] = params.title;
  if (params.questions !== undefined) patch["questions"] = params.questions;
  if (params.serviceNames !== undefined)
    patch["service_names"] = params.serviceNames;
  if (params.autoSend !== undefined) patch["auto_send"] = params.autoSend;
  if (params.requiresSignature !== undefined)
    patch["requires_signature"] = params.requiresSignature;
  if (params.isTerms !== undefined) patch["is_terms"] = params.isTerms;
  if (params.deadlineHours !== undefined)
    patch["deadline_hours"] = params.deadlineHours;
  patch["updated_at"] = new Date().toISOString();
  const { error } = await supabase
    .from("provider_form_library")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteLibraryForm(id: string): Promise<void> {
  const { error } = await supabase
    .from("provider_form_library")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function sendLibraryFormToClient(
  libraryFormId: string,
  bookingId: string,
  clientUserId: string,
): Promise<IntakeForm> {
  const [sent] = await sendLibraryFormToBookings(libraryFormId, [{ bookingId, clientUserId }]);
  if (!sent) throw new Error("Form not sent");
  return sent;
}

/** Send one saved form to several upcoming appointments at once: one read of
 *  the form, one insert for every copy, one sent_count update. Each client is
 *  told about their own booking (the notification is tied to it). A booking
 *  that already has this form is skipped, so tapping Send twice never gives a
 *  client the same form twice. */
export async function sendLibraryFormToBookings(
  libraryFormId: string,
  targets: { bookingId: string; clientUserId: string }[],
): Promise<IntakeForm[]> {
  if (targets.length === 0) return [];
  const provider = await getMyProviderProfile();
  if (!provider) throw new Error("No provider profile");

  const bookingIds = [...new Set(targets.map(t => t.bookingId))];
  const [libraryRead, sentRows] = await Promise.all([
    supabase.from("provider_form_library").select("*").eq("id", libraryFormId).single(),
    getSentFormsOnBookings(bookingIds),
  ]);
  const lf = libraryRead.data;
  if (libraryRead.error || !lf) throw new Error("Library form not found");
  // Never send a client an empty form (formProblem gives the screen the
  // reason; this is the last stop).
  const problem = formProblem((lf.questions ?? []) as IntakeFormQuestion[]);
  if (problem) throw new Error(problem);
  const already = new Set(bookingsHoldingForm(sentRows, libraryFormId, lf.title));

  const seen = new Set<string>();
  const fresh = targets.filter(t => {
    if (already.has(t.bookingId) || seen.has(t.bookingId)) return false;
    seen.add(t.bookingId);
    return true;
  });
  if (fresh.length === 0) return [];

  const { data, error } = await supabase
    .from("booking_intake_forms")
    .insert(fresh.map(t => ({
      booking_id: t.bookingId,
      provider_id: provider.id,
      client_user_id: t.clientUserId,
      title: lf.title,
      questions: lf.questions,
      requires_signature: lf.requires_signature,
      library_form_id: libraryFormId,
    })))
    .select();
  if (error) throw error;

  await supabase
    .from("provider_form_library")
    .update({ sent_count: (lf.sent_count ?? 0) + fresh.length })
    .eq("id", libraryFormId);

  await Promise.allSettled(fresh.map(t => notifyClientIntakeFormSent(
    t.clientUserId,
    t.bookingId,
    provider.id,
    lf.title,
    provider.display_name,
  )));

  return (data ?? []).map(mapIntakeForm);
}

/** Which of these bookings already have this saved form, so the picker can
 *  say so instead of offering to send it again. */
export async function getBookingIdsWithLibraryForm(
  libraryFormId: string,
  bookingIds: string[],
): Promise<string[]> {
  if (bookingIds.length === 0) return [];
  const [libraryRead, sentRows] = await Promise.all([
    supabase.from("provider_form_library").select("title").eq("id", libraryFormId).single(),
    getSentFormsOnBookings(bookingIds),
  ]);
  if (libraryRead.error) throw libraryRead.error;
  return bookingsHoldingForm(sentRows, libraryFormId, (libraryRead.data as { title: string }).title);
}

/** Every form already sent on these bookings (a few per booking at most). */
async function getSentFormsOnBookings(bookingIds: string[]): Promise<SentFormRow[]> {
  if (bookingIds.length === 0) return [];
  const { data, error } = await supabase
    .from("booking_intake_forms")
    .select("booking_id, library_form_id, title")
    .in("booking_id", bookingIds)
    .limit(bookingIds.length * 10);
  if (error) throw error;
  return (data ?? []) as SentFormRow[];
}

/** Tell the client (in-app + push via DB trigger) that a form is waiting for them.
 *  Non-fatal — the form itself is already created when this runs. */
async function notifyClientIntakeFormSent(
  clientUserId: string,
  bookingId: string,
  providerId: string,
  formTitle: string,
  providerName?: string | null,
): Promise<void> {
  try {
    let name = providerName;
    if (!name) {
      const { data } = await supabase
        .from("providers")
        .select("display_name")
        .eq("id", providerId)
        .maybeSingle();
      name = (data as any)?.display_name ?? "Your provider";
    }
    await sendProviderClientNotifications({
      recipientUserIds: [clientUserId],
      type: "intake_form_received",
      title: "Form to Complete",
      message: `${name} sent you "${formTitle}" to fill in before your appointment.`,
      priority: "high",
      isActionable: true,
      bookingId,
    });
  } catch {
    // best-effort only
  }
}

function mapLibraryForm(d: any): LibraryForm {
  return {
    id: d.id,
    providerId: d.provider_id,
    title: d.title,
    questions: d.questions ?? [],
    serviceNames: d.service_names ?? [],
    autoSend: d.auto_send ?? false,
    requiresSignature: d.requires_signature ?? false,
    isTerms: d.is_terms ?? false,
    deadlineHours: d.deadline_hours ?? null,
    sentCount: d.sent_count ?? 0,
    createdAt: d.created_at,
  };
}

export async function createIntakeForm(
  bookingId: string,
  providerId: string,
  clientUserId: string,
  title: string,
  questions: IntakeFormQuestion[],
): Promise<IntakeForm> {
  const { data, error } = await supabase
    .from("booking_intake_forms")
    .insert({
      booking_id: bookingId,
      provider_id: providerId,
      client_user_id: clientUserId,
      title,
      questions,
    })
    .select()
    .single();

  if (error) throw error;

  await notifyClientIntakeFormSent(clientUserId, bookingId, providerId, title);

  return mapIntakeForm(data);
}

export async function getIntakeFormByBooking(
  bookingId: string,
): Promise<IntakeForm | null> {
  const { data, error } = await supabase
    .from("booking_intake_forms")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Throws rather than returning null: null means "no form on this booking",
  // and the provider's booking detail offers to send one when it sees that.
  if (error) throw error;
  return data ? mapIntakeForm(data) : null;
}

/** Every form sent for one booking, oldest first (provider booking detail
 *  shows each one's sent/received state, not just the latest). */
export async function getIntakeFormsByBooking(
  bookingId: string,
): Promise<IntakeForm[]> {
  const { data, error } = await supabase
    .from("booking_intake_forms")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map(mapIntakeForm);
}

export async function getIntakeFormById(
  formId: string,
): Promise<IntakeForm | null> {
  const { data, error } = await supabase
    .from("booking_intake_forms")
    .select("*")
    .eq("id", formId)
    .single();

  if (error || !data) return null;
  return mapIntakeForm(data);
}

export async function submitIntakeFormAnswers(
  formId: string,
  answers: Record<string, string>,
  signature?: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    answers,
    status: "completed",
    completed_at: new Date().toISOString(),
  };
  if (signature !== undefined) patch["client_signature"] = signature;
  const { error } = await supabase
    .from("booking_intake_forms")
    .update(patch)
    .eq("id", formId);
  if (error) throw error;
  // DB trigger handle_intake_form_completed() fires on this UPDATE and notifies the provider.
}

export async function getPendingIntakeFormsForMe(): Promise<IntakeForm[]> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("booking_intake_forms")
    .select("*")
    .eq("client_user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(15);

  if (error) return [];
  return (data ?? []).map(mapIntakeForm);
}

export async function getMyProviderIntakeForms(): Promise<IntakeForm[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];
  const { data } = await supabase
    .from("booking_intake_forms")
    .select("*")
    .eq("provider_id", provider.id)
    .order("created_at", { ascending: false })
    .limit(15);
  return (data ?? []).map(mapIntakeForm);
}
