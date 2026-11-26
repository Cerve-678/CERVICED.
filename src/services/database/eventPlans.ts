// Database access: Event plans (My Plans).
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import type { DbEventChecklistItem, DbEventPlan, DbEventTask } from "../../types/database";

// ─────────────────────────────────────────────────────────
// EVENT PLANS (My Plans)
// ─────────────────────────────────────────────────────────

/** Fetch all event plans for the current user */
export async function getMyEventPlans(): Promise<DbEventPlan[]> {
  const { data, error } = await supabase
    .from("event_plans")
    .select("*")
    .order("event_date", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Fetch tasks and checklist for an event plan */
export async function getEventPlanDetails(eventPlanId: string): Promise<{
  tasks: DbEventTask[];
  checklist: DbEventChecklistItem[];
}> {
  const [tasksResult, checklistResult] = await Promise.all([
    supabase
      .from("event_tasks")
      .select("*")
      .eq("event_plan_id", eventPlanId)
      .order("sort_order"),
    supabase
      .from("event_checklist_items")
      .select("*")
      .eq("event_plan_id", eventPlanId)
      .order("sort_order"),
  ]);

  if (tasksResult.error) throw tasksResult.error;
  if (checklistResult.error) throw checklistResult.error;

  return {
    tasks: tasksResult.data ?? [],
    checklist: checklistResult.data ?? [],
  };
}
