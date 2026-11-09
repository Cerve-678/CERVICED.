import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, RefreshControl, ScrollView, Share, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useAppDialog } from '../../components/AppDialog';
import {
  editMarketingCaption, getAdminMarketingOverview, markMarketingPostPosted, recordMarketingResults,
  retireMarketingLearning, reviewMarketingPost, startMarketingPlan,
} from '../../services/databaseService';
import {
  LEARNING_KIND_LABEL, MARKETING_TABS, PLATFORM_LABEL, PLATFORM_URL, parseResults, postsForTab, resultsSummary,
  runStatusLine, shareableCaption, type MarketingTab, type ResultsDraft,
} from '../../features/admin/marketingPresentation';
import type { MarketingLearning, MarketingOverview, MarketingPost } from '../../types/marketing';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import { logger } from '../../utils/logger';

// ── Admin → Marketing ──────────────────────────────────────────────────────
// The Marketing Studio's review queue. Every Monday the marketing-studio edge
// function researches trends and drafts a week of ideas (TikTok first) from
// supabase/functions/marketing-studio/playbook.ts. Nothing is posted by the
// app: an admin approves, posts it themselves, then types in the numbers so
// next week's plan learns from them. Internal tool, so English only.

type Palette = ReturnType<typeof useTheme>['palette'];

const POLL_MS = 15_000;
const EMPTY_RESULTS: ResultsDraft = { views: '', likes: '', comments: '', shares: '', saves: '', follows: '', note: '' };

const EMPTY_COPY: Record<Exclude<MarketingTab, 'learned'>, string> = {
  review: 'Nothing waiting. The next plan arrives Monday morning, or plan a new week now.',
  ready: 'Approve an idea and it lands here, ready to film and post.',
  posted: 'Posted ideas show here. Add their numbers after a couple of days so the planner learns.',
};

export default function AdminMarketingScreen({ navigation }: any) {
  const { theme, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const { showAlert, DialogHost } = useAppDialog();
  const [data, setData] = useState<MarketingOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<MarketingTab>('review');
  const [starting, setStarting] = useState(false);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async () => {
    try {
      const overview = await getAdminMarketingOverview();
      if (!mounted.current) return;
      setData(overview);
      setLoadError(false);
    } catch (err) {
      logger.error('[AdminMarketing] overview failed to load:', err);
      if (mounted.current) setLoadError(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // While the planner is drafting, check back until it finishes.
  const running = data?.last_run?.status === 'running';
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => { void load(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const planNow = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setStarting(true);
    try {
      const result = await startMarketingPlan();
      if (result === 'already_running') showAlert('Already planning', 'A week is being drafted right now. It shows here when it’s done.');
      await load();
    } catch (err) {
      showAlert("Couldn't start the planner", toUserMessageAllowingDbGuard(err, 'Please try again in a moment.', 'AdminMarketing.plan'));
    } finally {
      if (mounted.current) setStarting(false);
    }
  }, [load, showAlert]);

  /** Runs one write, then reloads. Returns whether it worked, so a form can close. */
  const act = useCallback(async (what: string, fn: () => Promise<void>): Promise<boolean> => {
    try {
      await fn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await load();
      return true;
    } catch (err) {
      showAlert(`Couldn't ${what}`, toUserMessageAllowingDbGuard(err, 'Please try again in a moment.', `AdminMarketing.${what}`));
      return false;
    }
  }, [load, showAlert]);

  const counts = useMemo(() => ({
    review: data ? postsForTab(data.posts, 'review').length : 0,
    ready: data ? postsForTab(data.posts, 'ready').length : 0,
    posted: data ? postsForTab(data.posts, 'posted').length : 0,
    learned: data?.learnings.length ?? 0,
  }), [data]);

  const visible = useMemo(
    () => (data && tab !== 'learned' ? postsForTab(data.posts, tab) : []),
    [data, tab],
  );

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={theme.statusBar} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={P.accent} />}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: P.text }]}>MARKETING</Text>
        <Text style={[styles.subtitle, { color: P.sub }]}>
          Every Monday the planner researches what’s working and drafts a week of ideas, TikTok first. Nothing is
          posted until you post it. Add each post’s numbers and it learns what works for CERVICED.
        </Text>

        <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: P.accent, opacity: starting || running ? 0.5 : 1 }]}
            onPress={() => void planNow()}
            disabled={starting || running}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            {starting || running
              ? <ActivityIndicator size="small" color={P.onAccent} />
              : <Text style={[styles.ctaText, { color: P.onAccent }]}>PLAN A NEW WEEK NOW</Text>}
          </TouchableOpacity>
          <Text style={[styles.small, { color: P.sub }]}>{data ? runStatusLine(data.last_run) : ' '}</Text>
        </View>

        <View style={styles.tabs}>
          {MARKETING_TABS.map(t => {
            const selected = tab === t.key;
            const count = counts[t.key];
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setTab(t.key); }}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.tab, { backgroundColor: selected ? P.accent : P.card, borderColor: P.border }]}
              >
                <Text style={[styles.tabLabel, { color: selected ? P.onAccent : P.text }]}>{t.label}</Text>
                <Text style={[styles.tabCount, { color: selected ? P.onAccent : P.sub }]}>{count}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!data && !loadError && <ActivityIndicator style={{ marginTop: 40 }} color={P.accent} />}
        {!data && loadError && (
          <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.body, { color: P.text }]}>Marketing didn't load.</Text>
            <TouchableOpacity onPress={() => void load()} activeOpacity={0.7} accessibilityRole="button">
              <Text style={[styles.link, { color: P.accentText }]}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {data && tab === 'learned' && (
          data.learnings.length === 0
            ? <Text style={[styles.empty, { color: P.sub }]}>Nothing learned yet. Learnings appear after the first plan, and sharpen once posts have results.</Text>
            : data.learnings.map(l => (
              <LearningRow key={l.id} P={P} learning={l}
                onRetire={() => void act('retire that', () => retireMarketingLearning(l.id))} />
            ))
        )}

        {data && tab !== 'learned' && (
          visible.length === 0
            ? <Text style={[styles.empty, { color: P.sub }]}>{EMPTY_COPY[tab]}</Text>
            : visible.map(post => <PostCard key={post.id} P={P} post={post} act={act} />)
        )}
      </ScrollView>
      <DialogHost />
    </ThemedBackground>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

type Act = (what: string, fn: () => Promise<void>) => Promise<boolean>;
type OpenForm = null | 'reject' | 'caption' | 'posted' | 'results';

function PostCard({ P, post, act }: { P: Palette; post: MarketingPost; act: Act }) {
  const [expanded, setExpanded] = useState(post.status === 'approved');
  const [form, setForm] = useState<OpenForm>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [caption, setCaption] = useState(post.caption);
  const [url, setUrl] = useState(post.post_url ?? '');
  const [results, setResults] = useState<ResultsDraft>(EMPTY_RESULTS);
  const [formError, setFormError] = useState<string | null>(null);
  const summary = resultsSummary(post);
  const field = [styles.input, { color: P.text, backgroundColor: P.surface, borderColor: P.border }];

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(true);
    const ok = await act(what, fn);
    setBusy(false);
    if (ok) { setForm(null); setFormError(null); }
  };

  const openForm = (next: OpenForm) => {
    Haptics.selectionAsync().catch(() => {});
    setFormError(null);
    if (next === 'results') {
      const n = (v: number | null) => (v === null ? '' : String(v));
      setResults({
        views: n(post.views), likes: n(post.likes), comments: n(post.comments), shares: n(post.shares),
        saves: n(post.saves), follows: n(post.follows), note: post.results_note ?? '',
      });
    }
    setForm(form === next ? null : next);
  };

  const shareCaption = async () => {
    try {
      await Share.share({ message: shareableCaption({ caption: post.caption, hashtags: post.hashtags }) });
    } catch (err) {
      logger.error('[AdminMarketing] share failed:', err);
    }
  };

  const saveResults = () => {
    const parsed = parseResults(results);
    if (!parsed.ok) { setFormError(`“${parsed.field}” needs to be a whole number.`); return; }
    void run('save the results', () => recordMarketingResults(post.id, parsed.value));
  };

  const platformUrl = PLATFORM_URL[post.platform];

  return (
    <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
      <View style={styles.metaRow}>
        <View style={[styles.pill, { backgroundColor: P.accent }]}>
          <Text style={[styles.pillText, { color: P.onAccent }]}>{PLATFORM_LABEL[post.platform].toUpperCase()}</Text>
        </View>
        <Text style={[styles.meta, { color: P.sub }]}>{post.pillar} · {post.format}</Text>
        {post.ai_use === 'ai_visuals_labelled' && (
          <View style={[styles.pill, { borderColor: P.border, borderWidth: 1 }]}>
            <Text style={[styles.pillText, { color: P.text }]}>AI LABEL NEEDED</Text>
          </View>
        )}
      </View>
      <Text style={[styles.name, { color: P.text }]}>{post.title}</Text>
      <Text style={[styles.hook, { color: P.text }]}>“{post.hook}”</Text>

      <TouchableOpacity onPress={() => { Haptics.selectionAsync().catch(() => {}); setExpanded(e => !e); }}
        activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded }}>
        <Text style={[styles.link, { color: P.accentText }]}>{expanded ? 'Hide the plan' : 'See the plan'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={{ gap: 10 }}>
          <Detail P={P} label="THE IDEA" value={post.concept} />
          {post.shots.length > 0 && (
            <View>
              <Text style={[styles.label, { color: P.sub }]}>SHOTS</Text>
              {post.shots.map((shot, i) => (
                <Text key={`${post.id}-shot-${i}`} style={[styles.body, { color: P.text }]}>{i + 1}. {shot}</Text>
              ))}
            </View>
          )}
          <Detail P={P} label="ON SCREEN" value={post.on_screen_text} />
          <Detail P={P} label="SOUND" value={post.sound_idea} />
          <Detail P={P} label="CAPTION" value={shareableCaption(post)} />
          <Detail P={P} label="ALSO POST TO" value={post.also_post_to.map(p => PLATFORM_LABEL[p]).join(', ')} />
          <Detail P={P} label="WHY NOW" value={post.why_now} />
          <Detail P={P} label="WHAT IT NEEDS" value={post.needs} />
          <Detail P={P} label="WHEN" value={post.best_time} />
          <Detail P={P} label="BUDGET" value={post.ad_budget_note} />
          {post.sources.length > 0 && (
            <View>
              <Text style={[styles.label, { color: P.sub }]}>SOURCES</Text>
              {post.sources.map(src => (
                <TouchableOpacity key={src} onPress={() => void Linking.openURL(src)} activeOpacity={0.7} accessibilityRole="link">
                  <Text style={[styles.small, { color: P.accentText }]} numberOfLines={1}>{src}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {!!post.review_note && post.status !== 'draft' && (
        <Text style={[styles.small, { color: P.sub }]}>Your note: {post.review_note}</Text>
      )}

      {/* ── actions ── */}
      {post.status === 'draft' && (
        <View style={styles.actions}>
          <ActionBtn P={P} primary label="APPROVE" busy={busy} onPress={() => void run('approve it', () => reviewMarketingPost(post.id, 'approved'))} />
          <ActionBtn P={P} label="NOT THIS" onPress={() => openForm('reject')} />
        </View>
      )}
      {post.status === 'approved' && (
        <>
          <View style={styles.actions}>
            <ActionBtn P={P} primary label="SHARE CAPTION" onPress={() => void shareCaption()} />
            {platformUrl && (
              <ActionBtn P={P} label={`OPEN ${PLATFORM_LABEL[post.platform].toUpperCase()}`}
                onPress={() => void Linking.openURL(platformUrl)} />
            )}
          </View>
          <View style={styles.actions}>
            <ActionBtn P={P} label="EDIT CAPTION" onPress={() => openForm('caption')} />
            <ActionBtn P={P} label="MARK POSTED" onPress={() => openForm('posted')} />
          </View>
          <TouchableOpacity onPress={() => void run('move it back', () => reviewMarketingPost(post.id, 'draft'))}
            activeOpacity={0.7} accessibilityRole="button" disabled={busy}>
            <Text style={[styles.small, { color: P.sub, textAlign: 'center' }]}>Move back to review</Text>
          </TouchableOpacity>
        </>
      )}
      {post.status === 'posted' && (
        <>
          <Text style={[styles.body, { color: P.text }]}>{summary ?? 'No results yet. Add them after a couple of days.'}</Text>
          <View style={styles.actions}>
            <ActionBtn P={P} primary label={summary ? 'UPDATE RESULTS' : 'ADD RESULTS'} onPress={() => openForm('results')} />
            {!!post.post_url && (
              <ActionBtn P={P} label="OPEN POST" onPress={() => void Linking.openURL(post.post_url!)} />
            )}
          </View>
        </>
      )}

      {/* ── forms ── */}
      {form === 'reject' && (
        <View style={{ gap: 8 }}>
          <Text style={[styles.small, { color: P.sub }]}>Why not? The planner reads this and won’t repeat it.</Text>
          <TextInput style={[field, styles.multiline]} value={note} onChangeText={setNote} multiline maxLength={500}
            placeholder="e.g. too salesy, not our vibe, we can't film this" placeholderTextColor={P.sub}
            accessibilityLabel="Why not" editable={!busy} />
          <ActionBtn P={P} primary label="TURN DOWN" busy={busy}
            onPress={() => void run('turn it down', () => reviewMarketingPost(post.id, 'rejected', note))} />
        </View>
      )}
      {form === 'caption' && (
        <View style={{ gap: 8 }}>
          <TextInput style={[field, styles.multiline]} value={caption} onChangeText={setCaption} multiline maxLength={2200}
            accessibilityLabel="Caption" editable={!busy} />
          <ActionBtn P={P} primary label="SAVE CAPTION" busy={busy}
            onPress={() => void run('save the caption', () => editMarketingCaption(post.id, caption))} />
        </View>
      )}
      {form === 'posted' && (
        <View style={{ gap: 8 }}>
          <Text style={[styles.small, { color: P.sub }]}>Paste the link to the post (optional).</Text>
          <TextInput style={field} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false}
            keyboardType="url" placeholder="https://www.tiktok.com/@cerviced/video/…" placeholderTextColor={P.sub}
            accessibilityLabel="Link to the post" editable={!busy} />
          <ActionBtn P={P} primary label="MARK POSTED" busy={busy}
            onPress={() => void run('mark it posted', () => markMarketingPostPosted(post.id, url))} />
        </View>
      )}
      {form === 'results' && (
        <View style={{ gap: 8 }}>
          <Text style={[styles.small, { color: P.sub }]}>From the app’s own analytics. Leave a box empty if you don’t know.</Text>
          <View style={styles.grid}>
            {(['views', 'likes', 'comments', 'shares', 'saves', 'follows'] as const).map(key => (
              <View key={key} style={styles.gridCell}>
                <Text style={[styles.label, { color: P.sub }]}>{key.toUpperCase()}</Text>
                <TextInput style={field} value={results[key]} keyboardType="number-pad" editable={!busy}
                  onChangeText={v => setResults(r => ({ ...r, [key]: v }))} accessibilityLabel={key} />
              </View>
            ))}
          </View>
          <TextInput style={[field, styles.multiline]} value={results.note} multiline maxLength={500} editable={!busy}
            onChangeText={v => setResults(r => ({ ...r, note: v }))} placeholder="Anything else? e.g. comments asked for prices"
            placeholderTextColor={P.sub} accessibilityLabel="Notes on the results" />
          {!!formError && <Text accessibilityLiveRegion="polite" style={styles.error}>{formError}</Text>}
          <ActionBtn P={P} primary label="SAVE RESULTS" busy={busy} onPress={saveResults} />
        </View>
      )}
    </View>
  );
}

function Detail({ P, label, value }: { P: Palette; label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <View>
      <Text style={[styles.label, { color: P.sub }]}>{label}</Text>
      <Text style={[styles.body, { color: P.text }]} selectable>{value}</Text>
    </View>
  );
}

function ActionBtn({ P, label, onPress, primary, busy }: {
  P: Palette; label: string; onPress: () => void; primary?: boolean; busy?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, primary
        ? { backgroundColor: P.accent }
        : { borderColor: P.accent, borderWidth: 1 }, busy ? { opacity: 0.5 } : null]}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      {busy
        ? <ActivityIndicator size="small" color={primary ? P.onAccent : P.accent} />
        : <Text style={[styles.actionText, { color: primary ? P.onAccent : P.accentText }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

function LearningRow({ P, learning, onRetire }: { P: Palette; learning: MarketingLearning; onRetire: () => void }) {
  return (
    <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
      <View style={styles.metaRow}>
        <View style={[styles.pill, { borderColor: P.border, borderWidth: 1 }]}>
          <Text style={[styles.pillText, { color: P.text }]}>{LEARNING_KIND_LABEL[learning.kind].toUpperCase()}</Text>
        </View>
      </View>
      <Text style={[styles.body, { color: P.text, fontWeight: '600' }]}>{learning.insight}</Text>
      {!!learning.evidence && <Text style={[styles.small, { color: P.sub }]}>{learning.evidence}</Text>}
      <TouchableOpacity onPress={onRetire} activeOpacity={0.7} accessibilityRole="button" style={styles.retire}>
        <Ionicons name="close-circle-outline" size={16} color={P.sub} />
        <Text style={[styles.small, { color: P.sub }]}>Not true, forget this</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { width: 44, height: 44, justifyContent: 'center', marginLeft: -4 },
  backArrow: { fontSize: 24 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 32, letterSpacing: 1, marginTop: 4 },
  subtitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 8, marginBottom: 12 },
  cta: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 1.5 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  tab: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tabLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 10, letterSpacing: 1 },
  tabCount: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  empty: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 24, paddingHorizontal: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pill: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  pillText: { fontFamily: 'BakbakOne-Regular', fontSize: 10, letterSpacing: 1 },
  meta: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12 },
  name: { fontFamily: 'BakbakOne-Regular', fontSize: 16, letterSpacing: 1 },
  hook: { fontFamily: 'Jura-VariableFont_wght', fontSize: 16, lineHeight: 22, fontWeight: '600' },
  label: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1.5, marginBottom: 2 },
  body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20 },
  small: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 18 },
  link: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700', paddingVertical: 6 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  actionText: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1.2, textAlign: 'center' },
  input: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, minHeight: 44, paddingHorizontal: 12, fontSize: 15, fontFamily: 'Jura-VariableFont_wght' },
  multiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridCell: { width: '31%', flexGrow: 1 },
  error: { color: '#C0392B', fontFamily: 'Jura-VariableFont_wght', fontSize: 13 },
  retire: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
});
