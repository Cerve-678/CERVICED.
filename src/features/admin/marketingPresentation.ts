import type {
  MarketingLearningKind, MarketingPlatform, MarketingPost, MarketingResultsInput, MarketingRun,
} from '../../types/marketing';

// Pure helpers for Admin → Marketing. The screen groups ideas into four
// tabs, and the planner judges results by shares + saves per 1,000 views
// first (see the playbook's "How to learn"), so the screen shows the same.

export type MarketingTab = 'review' | 'ready' | 'posted' | 'learned';

export const MARKETING_TABS: { key: MarketingTab; label: string }[] = [
  { key: 'review', label: 'TO REVIEW' },
  { key: 'ready', label: 'TO POST' },
  { key: 'posted', label: 'POSTED' },
  { key: 'learned', label: 'LEARNED' },
];

export const PLATFORM_LABEL: Record<MarketingPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube_shorts: 'YouTube Shorts',
  pinterest: 'Pinterest',
  paid_ad: 'Paid ad',
};

/** Where "Open the app" goes once a caption is copied. Paid ads have no app to open. */
export const PLATFORM_URL: Partial<Record<MarketingPlatform, string>> = {
  tiktok: 'https://www.tiktok.com/upload',
  instagram: 'https://www.instagram.com/',
  youtube_shorts: 'https://studio.youtube.com/',
  pinterest: 'https://www.pinterest.co.uk/pin-creation-tool/',
};

export const LEARNING_KIND_LABEL: Record<MarketingLearningKind, string> = {
  trend: 'Trend',
  what_works: 'Works',
  what_flops: 'Flops',
  platform_rule: 'Platform rule',
  brand_rule: 'Brand rule',
};

/** Links the screen will open: https only, no user:password@. Mirrors isSafeHttpsUrl in the planner. */
export function isOpenableUrl(raw: string | null | undefined): raw is string {
  return !!raw && /^https:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/i.test(raw.trim());
}

export function postsForTab(posts: MarketingPost[], tab: Exclude<MarketingTab, 'learned'>): MarketingPost[] {
  const status = tab === 'review' ? 'draft' : tab === 'ready' ? 'approved' : 'posted';
  return posts.filter(p => p.status === status);
}

/** The caption as it should be pasted: caption, a blank line, then the hashtags. */
export function shareableCaption(post: Pick<MarketingPost, 'caption' | 'hashtags'>): string {
  const tags = post.hashtags.map(t => `#${t.replace(/^#+/, '')}`).join(' ');
  return [post.caption.trim(), tags].filter(Boolean).join('\n\n');
}

/** "12.4 per 1k views", or null when there are no views to divide by. */
export function per1k(count: number | null, views: number | null): string | null {
  if (count === null || views === null || views <= 0) return null;
  const rate = (count / views) * 1000;
  return `${rate >= 10 ? Math.round(rate) : rate.toFixed(1)} per 1k views`;
}

export function resultsSummary(post: MarketingPost): string | null {
  if (post.results_at === null || post.views === null) return null;
  const parts = [`${post.views.toLocaleString('en-GB')} views`];
  const shareSave = (post.shares ?? 0) + (post.saves ?? 0);
  const sharesSaves = per1k(shareSave, post.views);
  if (sharesSaves) parts.push(`shares + saves ${sharesSaves}`);
  const follows = per1k(post.follows, post.views);
  if (follows) parts.push(`follows ${follows}`);
  return parts.join(' · ');
}

/**
 * One results field as typed: blank is "don't know" (null), anything else
 * must be a whole number, with commas and spaces allowed ("12,400").
 * Returns undefined for something that isn't a number.
 */
export function parseCount(raw: string): number | null | undefined {
  const cleaned = raw.replace(/[,\s]/g, '');
  if (cleaned === '') return null;
  if (!/^\d+$/.test(cleaned)) return undefined;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) ? n : undefined;
}

export type ResultsDraft = Record<Exclude<keyof MarketingResultsInput, 'note'>, string> & { note: string };

/** The typed results, or the name of the first field that isn't a number. */
export function parseResults(draft: ResultsDraft): { ok: true; value: MarketingResultsInput } | { ok: false; field: string } {
  const fields = ['views', 'likes', 'comments', 'shares', 'saves', 'follows'] as const;
  const value: MarketingResultsInput = {
    views: null, likes: null, comments: null, shares: null, saves: null, follows: null, note: draft.note.trim(),
  };
  for (const field of fields) {
    const parsed = parseCount(draft[field]);
    if (parsed === undefined) return { ok: false, field };
    value[field] = parsed;
  }
  return { ok: true, value };
}

/** One line about the planner's latest run, for under the "Plan a new week" button. */
export function runStatusLine(run: MarketingRun | null, now: Date = new Date()): string {
  if (!run) return 'Plans a new week every Monday morning.';
  if (run.status === 'running') return 'Researching and drafting now. This takes a few minutes.';
  const when = new Date(run.finished_at ?? run.started_at);
  const days = Math.floor((now.getTime() - when.getTime()) / 86_400_000);
  const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  if (run.status === 'failed') return `The last plan didn't finish (${ago}): ${run.error ?? 'no reason given'}`;
  const count = `${run.posts_drafted} idea${run.posts_drafted === 1 ? '' : 's'}`;
  return `Last planned ${ago}: ${count}${run.week_theme ? `, “${run.week_theme}”` : ''}. Next plan Monday morning.`;
}
