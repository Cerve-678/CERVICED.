import { MAX_POSTS_PER_WEEK, normalizeWeekPlan } from './plan';

const LEARNING_ID = '3f1c2b9e-1d2a-4c5b-8e7f-0a1b2c3d4e5f';

function post(overrides: Record<string, unknown> = {}) {
  return {
    platform: 'tiktok', format: 'video', pillar: 'THE CHAIR', title: 'Chrome nails ASMR',
    hook: 'Close-up: the chrome powder hits the gel', concept: 'Hands-only, no talking.',
    shots: ['Tray of powders', 'Buff', 'Reveal'], on_screen_text: 'the sound >>>',
    caption: 'chrome nails london', hashtags: ['#nails', 'londonnails'], sound_idea: 'Original audio',
    also_post_to: ['instagram', 'tiktok', 'myspace'], why_now: 'Chrome is back for party season',
    sources: ['https://example.com/trend', 'not a url', 'http://plain.example'], ai_use: 'none', needs: 'A nail tech who agrees to be filmed',
    best_time: 'Thu 7pm', ad_budget_note: 'should be dropped for organic posts',
    ...overrides,
  };
}

describe('normalizeWeekPlan', () => {
  it('keeps a good idea and tidies the fields the table constrains', () => {
    const plan = normalizeWeekPlan({ week_theme: 'Party season', posts: [post()], learnings: [], retire_learning_ids: [] }, new Set());
    expect(plan.posts).toHaveLength(1);
    const p = plan.posts[0]!;
    expect(p.hashtags).toEqual(['nails', 'londonnails']);
    // Unknown platforms and the post's own platform are not "also post to".
    expect(p.also_post_to).toEqual(['instagram']);
    expect(p.sources).toEqual(['https://example.com/trend']);
    // Only paid ads carry a budget note.
    expect(p.ad_budget_note).toBe('');
  });

  it('drops ideas missing a platform, format, hook or concept instead of failing the week', () => {
    const plan = normalizeWeekPlan({
      posts: [post({ platform: 'myspace' }), post({ hook: '  ' }), post({ format: 'reel' }), post()],
    }, new Set());
    expect(plan.posts).toHaveLength(1);
  });

  it('drops an idea whose AI use it can\'t read, rather than calling it "no AI"', () => {
    const plan = normalizeWeekPlan({ posts: [post({ ai_use: 'deepfake' }), post({ ai_use: undefined }), post()] }, new Set());
    expect(plan.posts).toHaveLength(1);
  });

  it('throws when nothing usable is left, so a run never saves an empty week', () => {
    expect(() => normalizeWeekPlan({ posts: [post({ concept: '' })] }, new Set())).toThrow('no usable ideas');
    expect(() => normalizeWeekPlan('nope', new Set())).toThrow();
  });

  it('caps the week and falls back to safe defaults', () => {
    const many = Array.from({ length: MAX_POSTS_PER_WEEK + 5 }, () => post({ pillar: '' }));
    const plan = normalizeWeekPlan({ posts: many }, new Set());
    expect(plan.posts).toHaveLength(MAX_POSTS_PER_WEEK);
    expect(plan.posts[0]!.pillar).toBe('UNSORTED');
  });

  it('only retires learnings that exist, and only keeps valid learning kinds', () => {
    const plan = normalizeWeekPlan({
      posts: [post()],
      learnings: [{ kind: 'what_works', insight: 'Hands-only beats talking heads', evidence: '3 posts' }, { kind: 'vibes', insight: 'x' }],
      retire_learning_ids: [LEARNING_ID, '00000000-0000-0000-0000-000000000000', 'drop table'],
    }, new Set([LEARNING_ID]));
    expect(plan.learnings).toEqual([{ kind: 'what_works', insight: 'Hands-only beats talking heads', evidence: '3 posts' }]);
    expect(plan.retire_learning_ids).toEqual([LEARNING_ID]);
  });
});

describe('isSafeHttpsUrl', () => {
  const { isSafeHttpsUrl } = jest.requireActual('./plan') as typeof import('./plan');
  it('opens only plain https links', () => {
    expect(isSafeHttpsUrl('https://newsroom.tiktok.com/en-gb/how-tiktok-recommends')).toBe(true);
    expect(isSafeHttpsUrl('http://example.com')).toBe(false);
    expect(isSafeHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpsUrl('https://user:pass@evil.example/login')).toBe(false);
    expect(isSafeHttpsUrl('intent://scan#Intent;end')).toBe(false);
  });
});
