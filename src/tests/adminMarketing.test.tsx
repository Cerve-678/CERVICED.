import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AdminMarketingScreen from '../screens/shared/AdminMarketingScreen';
import { getAdminMarketingOverview, reviewMarketingPost } from '../services/databaseService';
import {
  parseCount, parseResults, per1k, postsForTab, resultsSummary, runStatusLine, shareableCaption,
} from '../features/admin/marketingPresentation';
import type { MarketingOverview, MarketingPost, MarketingRun } from '../types/marketing';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined), selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined), ImpactFeedbackStyle: {}, NotificationFeedbackType: {},
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }) }));
jest.mock('../components/ThemedBackground', () => ({ ThemedBackground: ({ children }: any) => children }));
jest.mock('../components/AppDialog', () => ({ useAppDialog: () => ({ showAlert: jest.fn(), DialogHost: () => null }) }));
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDarkMode: false, theme: { statusBar: 'dark-content' },
    palette: { bg: '#F5F1EC', card: '#FFFFFF', surface: '#EDE8E2', accent: '#5C4033', accentText: '#5C4033', onAccent: '#FFFFFF', text: '#000000', sub: '#7E6667', border: '#eee', sep: '#eee' },
  }),
}));
jest.mock('../services/databaseService', () => ({
  getAdminMarketingOverview: jest.fn(),
  reviewMarketingPost: jest.fn().mockResolvedValue(undefined),
  editMarketingCaption: jest.fn(), markMarketingPostPosted: jest.fn(), recordMarketingResults: jest.fn(),
  retireMarketingLearning: jest.fn(), startMarketingPlan: jest.fn(),
}));
jest.mock('../utils/logger', () => ({ logger: { error: jest.fn() } }));

function post(overrides: Partial<MarketingPost> = {}): MarketingPost {
  return {
    id: 'p1', created_at: '2026-11-09T06:00:00Z', platform: 'tiktok', format: 'video', pillar: 'THE CHAIR',
    title: 'Chrome nails ASMR', hook: 'The powder hits the gel', concept: 'Hands only.', shots: ['Buff', 'Reveal'],
    on_screen_text: '', caption: 'chrome nails london', hashtags: ['nails', '#londonnails'], sound_idea: 'Original audio',
    also_post_to: ['instagram'], why_now: 'Party season', sources: [], ai_use: 'none', needs: '', best_time: 'Thu 7pm',
    ad_budget_note: '', status: 'draft', review_note: null, reviewed_at: null, posted_at: null, post_url: null,
    views: null, likes: null, comments: null, shares: null, saves: null, follows: null, results_note: null, results_at: null,
    ...overrides,
  };
}

const run = (overrides: Partial<MarketingRun> = {}): MarketingRun => ({
  id: 'r1', started_at: '2026-11-09T06:00:00Z', finished_at: '2026-11-09T06:04:00Z', status: 'done',
  trigger: 'schedule', week_theme: 'Party season', posts_drafted: 9, error: null, ...overrides,
});

describe('marketing presentation', () => {
  it('sorts ideas into the review, to-post and posted tabs by status', () => {
    const posts = [post({ id: 'a' }), post({ id: 'b', status: 'approved' }), post({ id: 'c', status: 'posted' }), post({ id: 'd', status: 'rejected' })];
    expect(postsForTab(posts, 'review').map(p => p.id)).toEqual(['a']);
    expect(postsForTab(posts, 'ready').map(p => p.id)).toEqual(['b']);
    expect(postsForTab(posts, 'posted').map(p => p.id)).toEqual(['c']);
  });

  it('builds a paste-ready caption with one # per tag', () => {
    expect(shareableCaption({ caption: 'chrome nails london ', hashtags: ['nails', '#londonnails'] }))
      .toBe('chrome nails london\n\n#nails #londonnails');
    expect(shareableCaption({ caption: '', hashtags: [] })).toBe('');
  });

  it('judges results per 1,000 views, shares and saves first', () => {
    expect(per1k(31, 2500)).toBe('12 per 1k views');
    expect(per1k(3, 2500)).toBe('1.2 per 1k views');
    expect(per1k(3, 0)).toBeNull();
    expect(resultsSummary(post({ status: 'posted', results_at: '2026-11-11T00:00:00Z', views: 12400, shares: 40, saves: 84, follows: 12 })))
      .toBe('12,400 views · shares + saves 10 per 1k views · follows 1.0 per 1k views');
    expect(resultsSummary(post({ status: 'posted' }))).toBeNull();
  });

  it('reads typed counts: blank is unknown, commas are fine, words are not', () => {
    expect(parseCount('')).toBeNull();
    expect(parseCount('12,400')).toBe(12400);
    expect(parseCount('12k')).toBeUndefined();
    expect(parseCount('-3')).toBeUndefined();
    const bad = parseResults({ views: '100', likes: 'lots', comments: '', shares: '', saves: '', follows: '', note: '' });
    expect(bad).toEqual({ ok: false, field: 'likes' });
    const good = parseResults({ views: '1 000', likes: '', comments: '2', shares: '', saves: '', follows: '', note: ' ok ' });
    expect(good).toEqual({ ok: true, value: { views: 1000, likes: null, comments: 2, shares: null, saves: null, follows: null, note: 'ok' } });
  });

  it('says what the planner last did, including why it failed', () => {
    const now = new Date('2026-11-10T09:00:00Z');
    expect(runStatusLine(null, now)).toBe('Plans a new week every Monday morning.');
    expect(runStatusLine(run({ status: 'running' }), now)).toContain('drafting now');
    expect(runStatusLine(run(), now)).toBe('Last planned yesterday: 9 ideas, “Party season”. Next plan Monday morning.');
    expect(runStatusLine(run({ status: 'failed', error: 'No ANTHROPIC_API_KEY is set on the Supabase project yet.' }), now))
      .toContain('No ANTHROPIC_API_KEY');
  });
});

describe('AdminMarketingScreen', () => {
  const overview: MarketingOverview = {
    generated_at: '2026-11-09T07:00:00Z',
    posts: [post(), post({ id: 'p2', status: 'approved', title: 'Day in the life of a mobile lash tech' })],
    learnings: [{ id: 'l1', created_at: '2026-11-09T06:04:00Z', kind: 'trend', insight: 'Chrome is back', evidence: 'Search interest up' }],
    last_run: run(),
  };

  beforeEach(() => {
    (getAdminMarketingOverview as jest.Mock).mockResolvedValue(overview);
  });

  it('shows the review queue first and approves an idea', async () => {
    const screen = render(<AdminMarketingScreen navigation={{ goBack: jest.fn() }} />);
    await waitFor(() => expect(screen.getByText('Chrome nails ASMR')).toBeTruthy());
    expect(screen.queryByText('Day in the life of a mobile lash tech')).toBeNull();
    fireEvent.press(screen.getByText('APPROVE'));
    await waitFor(() => expect(reviewMarketingPost).toHaveBeenCalledWith('p1', 'approved'));
  });

  it('moves between tabs, including what it has learned', async () => {
    const screen = render(<AdminMarketingScreen navigation={{ goBack: jest.fn() }} />);
    await waitFor(() => expect(screen.getByText('Chrome nails ASMR')).toBeTruthy());
    fireEvent.press(screen.getByText('TO POST'));
    expect(screen.getByText('Day in the life of a mobile lash tech')).toBeTruthy();
    expect(screen.getByText('SHARE CAPTION')).toBeTruthy();
    fireEvent.press(screen.getByText('LEARNED'));
    expect(screen.getByText('Chrome is back')).toBeTruthy();
  });
});
