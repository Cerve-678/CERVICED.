// The shape of one week's plan from the Marketing Studio planner, and the
// check every plan passes before a single row is written. Pure (no imports),
// so jest can test it and the Deno function can import it.
//
// The planner returns its week by calling the save_week tool with
// SAVE_WEEK_SCHEMA. Strict tool use already holds the shape, but this file
// still re-checks it: the tool input arrives as model output, and the CHECK
// constraints in 20261109210000_marketing_studio.sql would otherwise reject
// the whole insert over one bad value.

export const PLATFORMS = ['tiktok', 'instagram', 'youtube_shorts', 'pinterest', 'paid_ad'] as const;
export const FORMATS = ['video', 'carousel', 'photo', 'story', 'ad'] as const;
export const AI_USES = ['none', 'ideas_only', 'ai_visuals_labelled'] as const;
export const LEARNING_KINDS = ['trend', 'what_works', 'what_flops', 'platform_rule', 'brand_rule'] as const;

export type Platform = (typeof PLATFORMS)[number];
export type PostFormat = (typeof FORMATS)[number];
export type AiUse = (typeof AI_USES)[number];
export type LearningKind = (typeof LEARNING_KINDS)[number];

export interface PlannedPost {
  platform: Platform;
  format: PostFormat;
  pillar: string;
  title: string;
  hook: string;
  concept: string;
  shots: string[];
  on_screen_text: string;
  caption: string;
  hashtags: string[];
  sound_idea: string;
  also_post_to: Platform[];
  why_now: string;
  sources: string[];
  ai_use: AiUse;
  needs: string;
  best_time: string;
  ad_budget_note: string;
}

export interface PlannedLearning {
  kind: LearningKind;
  insight: string;
  evidence: string;
}

export interface WeekPlan {
  week_theme: string;
  posts: PlannedPost[];
  learnings: PlannedLearning[];
  retire_learning_ids: string[];
}

export const MAX_POSTS_PER_WEEK = 14;
export const MAX_LEARNINGS_PER_WEEK = 10;

const str = { type: 'string' } as const;
const strList = { type: 'array', items: { type: 'string' } } as const;

/** input_schema for the save_week tool (strict: every field required, nothing extra). */
export const SAVE_WEEK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['week_theme', 'posts', 'learnings', 'retire_learning_ids'],
  properties: {
    week_theme: { type: 'string', description: 'One line: the idea tying this week together.' },
    posts: {
      type: 'array',
      description: `Between 6 and ${MAX_POSTS_PER_WEEK} ideas, TikTok-first.`,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'platform', 'format', 'pillar', 'title', 'hook', 'concept', 'shots', 'on_screen_text', 'caption',
          'hashtags', 'sound_idea', 'also_post_to', 'why_now', 'sources', 'ai_use', 'needs', 'best_time',
          'ad_budget_note',
        ],
        properties: {
          platform: { type: 'string', enum: [...PLATFORMS] },
          format: { type: 'string', enum: [...FORMATS] },
          pillar: { type: 'string', description: 'One playbook pillar, e.g. THE CHAIR.' },
          title: { type: 'string', description: 'Short internal name for the idea.' },
          hook: { type: 'string', description: 'The first 1–2 seconds: what is seen and said.' },
          concept: { type: 'string', description: 'What happens and why it should work, in a few sentences.' },
          shots: { ...strList, description: 'Shot list in order, each filmable on a phone.' },
          on_screen_text: str,
          caption: { type: 'string', description: 'Ready-to-paste caption, keywords included.' },
          hashtags: { ...strList, description: 'Without the # sign.' },
          sound_idea: { type: 'string', description: 'Commercial Music Library or original audio idea.' },
          also_post_to: { type: 'array', items: { type: 'string', enum: [...PLATFORMS] } },
          why_now: { type: 'string', description: 'The trend, moment or learning this idea rides.' },
          sources: { ...strList, description: 'URLs from this week’s research that back it.' },
          ai_use: { type: 'string', enum: [...AI_USES] },
          needs: { type: 'string', description: 'What it takes to make: location, props, people, permissions.' },
          best_time: { type: 'string', description: 'Suggested day/time (UK) to post.' },
          ad_budget_note: { type: 'string', description: 'Paid ads only: suggested budget and audience. Empty otherwise.' },
        },
      },
    },
    learnings: {
      type: 'array',
      description: `Up to ${MAX_LEARNINGS_PER_WEEK} new learnings from research and results.`,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'insight', 'evidence'],
        properties: {
          kind: { type: 'string', enum: [...LEARNING_KINDS] },
          insight: str,
          evidence: str,
        },
      },
    },
    retire_learning_ids: { ...strList, description: 'Ids of existing learnings new evidence contradicts.' },
  },
} as const;

/** https only, with a host and no user:password@ part. Mirrored by isOpenableUrl in the app. */
export function isSafeHttpsUrl(raw: string): boolean {
  return /^https:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/i.test(raw);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function textList(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(item => text(item, maxLen)).filter(Boolean).slice(0, maxItems);
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

/**
 * Turns the planner's save_week input into rows that will pass the table's
 * CHECK constraints. Drops any idea missing the essentials (platform, format,
 * hook, concept, a valid ai_use) rather than failing the week; throws only when nothing usable
 * is left, so a run never "succeeds" with an empty queue.
 */
export function normalizeWeekPlan(raw: unknown, knownLearningIds: ReadonlySet<string>): WeekPlan {
  if (!isRecord(raw)) throw new Error('The plan was not an object.');

  const posts: PlannedPost[] = [];
  for (const item of Array.isArray(raw.posts) ? raw.posts : []) {
    if (!isRecord(item)) continue;
    const platform = oneOf(item.platform, PLATFORMS);
    const format = oneOf(item.format, FORMATS);
    const hook = text(item.hook, 400);
    const concept = text(item.concept, 2000);
    // An unreadable ai_use drops the idea: "no AI" must never be a default.
    const ai_use = oneOf(item.ai_use, AI_USES);
    if (!platform || !format || !hook || !concept || !ai_use) continue;
    posts.push({
      platform,
      format,
      pillar: text(item.pillar, 60) || 'UNSORTED',
      title: text(item.title, 120) || hook.slice(0, 120),
      hook,
      concept,
      shots: textList(item.shots, 20, 300),
      on_screen_text: text(item.on_screen_text, 500),
      caption: text(item.caption, 2200),
      hashtags: textList(item.hashtags, 15, 60).map(tag => tag.replace(/^#+/, '')).filter(Boolean),
      sound_idea: text(item.sound_idea, 300),
      also_post_to: textList(item.also_post_to, PLATFORMS.length, 30)
        .map(p => oneOf(p, PLATFORMS))
        .filter((p): p is Platform => p !== null && p !== platform),
      why_now: text(item.why_now, 800),
      sources: textList(item.sources, 8, 500).filter(isSafeHttpsUrl),
      ai_use,
      needs: text(item.needs, 800),
      best_time: text(item.best_time, 120),
      ad_budget_note: platform === 'paid_ad' ? text(item.ad_budget_note, 500) : '',
    });
    if (posts.length >= MAX_POSTS_PER_WEEK) break;
  }
  if (posts.length === 0) throw new Error('The plan had no usable ideas.');

  const learnings: PlannedLearning[] = [];
  for (const item of Array.isArray(raw.learnings) ? raw.learnings : []) {
    if (!isRecord(item)) continue;
    const kind = oneOf(item.kind, LEARNING_KINDS);
    const insight = text(item.insight, 600);
    if (!kind || !insight) continue;
    learnings.push({ kind, insight, evidence: text(item.evidence, 1200) });
    if (learnings.length >= MAX_LEARNINGS_PER_WEEK) break;
  }

  const retire_learning_ids = textList(raw.retire_learning_ids, 50, 64)
    .filter(id => UUID_RE.test(id) && knownLearningIds.has(id));

  return { week_theme: text(raw.week_theme, 300), posts, learnings, retire_learning_ids };
}
