// What admin_marketing_overview() returns:
// supabase/migrations/20261110130000_marketing_studio.sql. Admin-only.
// Drafts are written by the marketing-studio edge function; the playbook it
// follows is supabase/functions/marketing-studio/playbook.ts.

export type MarketingPlatform = 'tiktok' | 'instagram' | 'youtube_shorts' | 'pinterest' | 'paid_ad';
export type MarketingPostStatus = 'draft' | 'approved' | 'rejected' | 'posted';
export type MarketingAiUse = 'none' | 'ideas_only' | 'ai_visuals_labelled';
export type MarketingLearningKind = 'trend' | 'what_works' | 'what_flops' | 'platform_rule' | 'brand_rule';

export interface MarketingPost {
  id: string;
  created_at: string;
  platform: MarketingPlatform;
  format: 'video' | 'carousel' | 'photo' | 'story' | 'ad';
  pillar: string;
  title: string;
  hook: string;
  concept: string;
  shots: string[];
  on_screen_text: string;
  caption: string;
  hashtags: string[];
  sound_idea: string;
  also_post_to: MarketingPlatform[];
  why_now: string;
  sources: string[];
  ai_use: MarketingAiUse;
  needs: string;
  best_time: string;
  ad_budget_note: string;
  status: MarketingPostStatus;
  review_note: string | null;
  reviewed_at: string | null;
  posted_at: string | null;
  post_url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  follows: number | null;
  results_note: string | null;
  results_at: string | null;
}

export interface MarketingLearning {
  id: string;
  created_at: string;
  kind: MarketingLearningKind;
  insight: string;
  evidence: string;
}

export interface MarketingRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'done' | 'failed';
  trigger: 'schedule' | 'admin';
  week_theme: string | null;
  posts_drafted: number;
  error: string | null;
}

export interface MarketingOverview {
  generated_at: string;
  posts: MarketingPost[];
  learnings: MarketingLearning[];
  last_run: MarketingRun | null;
}

export interface MarketingResultsInput {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  follows: number | null;
  note: string;
}
