// src/screens/client/CircleScreen.tsx
//
// Your circle: find people by name or from your contacts, answer follow
// requests, see who you follow and who follows you, and the three sharing
// switches (Private account, Show where I go, Findable by phone number).
// Reached from Beauty Profile. Contacts are only read after a tap on
// "Allow contacts" — see src/features/social/contacts.ts.
//
// Every rule — who's private, under-18s, blocks, what a follower can see —
// is enforced by the server (migration 20261108220000); this screen only
// shows what it returns and asks it to change things. A follow change resets
// the face stacks on cards (useCircleStore.invalidate) so they refetch.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useAppDialog } from '../../components/AppDialog';
import {
  blockPerson,
  getMyPeople,
  removeFollower,
  requestFollow,
  respondFollowRequest,
  searchPeople,
  unfollowPerson,
} from '../../services/databaseService';
import { useCircleStore } from '../../stores/useCircleStore';
import { useSocialSettingsStore } from '../../stores/useSocialSettingsStore';
import { firstName, initialsFor } from '../../features/social/presentation';
import {
  PERSON_ACTION_LABEL,
  personAction,
  withMyStatus,
  withoutPerson,
  withPersonFirst,
} from '../../features/social/people';
import type { PersonListEntry, PersonSummary, SocialSettingsUpdate } from '../../features/social/types';
import {
  cachedContactMatches,
  findContactsOnCerviced,
  getContactsAccess,
  isContactsLimitError,
  rememberContactMatches,
  requestContactsAccess,
  type ContactMatchResult,
} from '../../features/social/contacts';
import {
  FONT_BODY,
  FONT_DISPLAY,
  GhostButton,
  Note,
  PrimaryButton,
  SwitchRow,
  hapticLight,
  hapticSuccess,
  ui,
} from '../../features/maintenance/ui';
import type { AppTheme } from '../../constants/theme';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import type { ProfileScreenProps } from '../../navigation/types';

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY = 2;
const FACE = 42;

type Row =
  | { kind: 'result'; key: string; person: PersonSummary; contactName?: string | null }
  | { kind: 'contacts'; key: string }
  | { kind: 'request'; key: string; entry: PersonListEntry }
  | { kind: 'following'; key: string; entry: PersonListEntry }
  | { kind: 'follower'; key: string; entry: PersonListEntry }
  | { kind: 'sharing'; key: string }
  | { kind: 'note'; key: string; text: string }
  | { kind: 'retry'; key: string; text: string };

interface Section {
  key: string;
  title: string;
  data: Row[];
}

type ListsState = 'loading' | 'ready' | 'error';

function Face({ name, avatarUrl, P }: { name: string; avatarUrl: string | null; P: AppTheme }) {
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[styles.face, { borderColor: P.border }]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={[styles.face, styles.faceInitials, { backgroundColor: P.accentDim, borderColor: P.border }]}>
      <Text style={[styles.faceInitialsText, { color: P.accentText }]}>{initialsFor(name)}</Text>
    </View>
  );
}

export default function CircleScreen(_props: ProfileScreenProps<'Circle'>) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { palette: P } = useTheme();
  const { showAlert, showConfirm, showToast, DialogHost } = useAppDialog();

  const settings = useSocialSettingsStore((s) => (s.ownerId === userId ? s.settings : null));
  const [settingsError, setSettingsError] = useState(false);
  const [savingSetting, setSavingSetting] = useState(false);

  const [listsState, setListsState] = useState<ListsState>('loading');
  const [requests, setRequests] = useState<PersonListEntry[]>([]);
  const [following, setFollowing] = useState<PersonListEntry[]>([]);
  const [followers, setFollowers] = useState<PersonListEntry[]>([]);
  const loadSeq = useRef(0);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonSummary[]>([]);

  // Contacts: nothing is read until "Allow contacts". The last result is
  // kept in memory for the app session (contacts.ts), since the server
  // allows 3000 numbers a day and a re-send would spend it again.
  type ContactsState = 'idle' | 'checking' | 'done' | 'off' | 'error' | 'dismissed';
  const cachedContacts = userId ? cachedContactMatches(userId) : null;
  const [contactsState, setContactsState] = useState<ContactsState>(cachedContacts ? 'done' : 'idle');
  const [contactMatches, setContactMatches] = useState<ContactMatchResult[]>(cachedContacts ?? []);
  const [contactsError, setContactsError] = useState<string | null>(null);
  // Set the instant the button is tapped, so a double tap can't run two checks.
  const contactsInFlight = useRef(false);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Back from Settings with access now granted: offer the check again
  // (still only on a tap, never automatically).
  useEffect(() => {
    if (contactsState !== 'off') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      getContactsAccess()
        .then((access) => { if (access === 'granted') setContactsState('idle'); })
        .catch(() => {});
    });
    return () => sub.remove();
  }, [contactsState]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  // userId of the row whose button is mid-request, so it can't be double-tapped.
  const [busyId, setBusyId] = useState<string | null>(null);

  const trimmed = query.trim();
  const inSearch = trimmed.length >= MIN_QUERY;

  // ── Loading ───────────────────────────────────────────────────────────────

  const loadLists = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const [req, ing, ers] = await Promise.all([
        getMyPeople('requests'),
        getMyPeople('following'),
        getMyPeople('followers'),
      ]);
      if (seq !== loadSeq.current) return;
      setRequests(req);
      setFollowing(ing);
      setFollowers(ers);
      setListsState('ready');
    } catch (err) {
      if (seq !== loadSeq.current) return;
      toUserMessageAllowingDbGuard(err, undefined, '[circle] load people lists');
      setListsState((s) => (s === 'ready' ? s : 'error'));
    }
  }, []);

  const loadSettings = useCallback(async () => {
    if (!userId) return;
    try {
      // Forced so the switches and counts are fresh each visit.
      await useSocialSettingsStore.getState().load(userId, true);
      setSettingsError(false);
    } catch (err) {
      toUserMessageAllowingDbGuard(err, undefined, '[circle] load sharing settings');
      setSettingsError(true);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void loadLists();
      void loadSettings();
    }, [loadLists, loadSettings]),
  );

  // ── Search ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const seq = ++searchSeq.current;
    if (!inSearch) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchPeople(trimmed);
        if (seq !== searchSeq.current) return;
        setResults(found);
        setSearchError(null);
      } catch (err) {
        if (seq !== searchSeq.current) return;
        setSearchError(toUserMessageAllowingDbGuard(err, "Couldn't search just now. Please try again.", '[circle] search people'));
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, inSearch]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const afterFollowChange = useCallback(() => {
    useCircleStore.getState().invalidate();
  }, []);

  /** Runs one row's request with its button locked, showing a friendly error on failure. */
  const runForRow = useCallback(
    async (personId: string, fallback: string, context: string, work: () => Promise<void>) => {
      if (busyId) return;
      setBusyId(personId);
      try {
        await work();
      } catch (err) {
        showAlert(fallback, toUserMessageAllowingDbGuard(err, 'Please try again in a moment.', context));
      } finally {
        setBusyId(null);
      }
    },
    [busyId, showAlert],
  );

  const follow = useCallback(
    (person: PersonSummary) =>
      runForRow(person.userId, "Couldn't follow", '[circle] request follow', async () => {
        const status = await requestFollow(person.userId);
        setResults((list) => withMyStatus(list, person.userId, status));
        setContactMatches((list) => withMyStatus(list, person.userId, status));
        setFollowing((list) =>
          withPersonFirst(list, {
            userId: person.userId,
            name: person.name,
            avatarUrl: person.avatarUrl,
            status,
            since: new Date().toISOString(),
          }),
        );
        afterFollowChange();
        hapticSuccess();
        showToast(
          status === 'pending'
            ? `Request sent to ${firstName(person.name)}`
            : `You're following ${firstName(person.name)}`,
          'success',
        );
      }),
    [runForRow, afterFollowChange, showToast],
  );

  const confirmUnfollow = useCallback(
    (personId: string, name: string, pending: boolean) => {
      const first = firstName(name);
      showConfirm(
        pending ? `Cancel your request to ${first}?` : `Unfollow ${first}?`,
        pending ? undefined : `You'll stop seeing where ${first} goes.`,
        [
          {
            text: pending ? 'Cancel request' : 'Unfollow',
            style: 'destructive',
            onPress: () =>
              void runForRow(personId, "Couldn't unfollow", '[circle] unfollow', async () => {
                await unfollowPerson(personId);
                setResults((list) => withMyStatus(list, personId, null));
                setContactMatches((list) => withMyStatus(list, personId, null));
                setFollowing((list) => withoutPerson(list, personId));
                afterFollowChange();
              }),
          },
          { text: 'Keep', style: 'cancel' },
        ],
      );
    },
    [showConfirm, runForRow, afterFollowChange],
  );

  const respond = useCallback(
    (entry: PersonListEntry, accept: boolean) =>
      runForRow(entry.userId, accept ? "Couldn't accept" : "Couldn't decline", '[circle] respond to request', async () => {
        await respondFollowRequest(entry.userId, accept);
        setRequests((list) => withoutPerson(list, entry.userId));
        if (accept) {
          setFollowers((list) => withPersonFirst(list, { ...entry, status: 'accepted', since: new Date().toISOString() }));
          hapticSuccess();
        }
        afterFollowChange();
      }),
    [runForRow, afterFollowChange],
  );

  const confirmRemoveFollower = useCallback(
    (entry: PersonListEntry) => {
      const first = firstName(entry.name);
      const open = settings ? !settings.isPrivate : false;
      showConfirm(
        `Remove ${first}?`,
        open
          ? `${first} won't be told. Your account is open, so they could follow you again. Block them to stop that.`
          : `${first} won't be told. They'll stop seeing where you go.`,
        [
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () =>
              void runForRow(entry.userId, "Couldn't remove", '[circle] remove follower', async () => {
                await removeFollower(entry.userId);
                setFollowers((list) => withoutPerson(list, entry.userId));
                setResults((list) => list.map((p) => (p.userId === entry.userId ? { ...p, followsMe: null } : p)));
                setContactMatches((list) => list.map((p) => (p.userId === entry.userId ? { ...p, followsMe: null } : p)));
                afterFollowChange();
              }),
          },
          { text: 'Keep', style: 'cancel' },
        ],
      );
    },
    [settings, showConfirm, runForRow, afterFollowChange],
  );

  const confirmBlock = useCallback(
    (personId: string, name: string) => {
      const first = firstName(name);
      showConfirm(
        `Block ${first}?`,
        `You'll stop following each other, and ${first} won't be able to find you or follow you. They won't be told. You can't undo this in the app yet.`,
        [
          {
            text: 'Block',
            style: 'destructive',
            onPress: () =>
              void runForRow(personId, "Couldn't block", '[circle] block person', async () => {
                await blockPerson(personId);
                setResults((list) => withoutPerson(list, personId));
                setContactMatches((list) => withoutPerson(list, personId));
                setRequests((list) => withoutPerson(list, personId));
                setFollowing((list) => withoutPerson(list, personId));
                setFollowers((list) => withoutPerson(list, personId));
                afterFollowChange();
                showToast(`${first} is blocked`, 'info');
              }),
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    },
    [showConfirm, runForRow, afterFollowChange, showToast],
  );

  // ── Sharing switches ──────────────────────────────────────────────────────

  const saveSetting = useCallback(
    async (patch: SocialSettingsUpdate) => {
      if (!userId || savingSetting) return;
      setSavingSetting(true);
      try {
        const store = useSocialSettingsStore.getState();
        const next = await store.update(userId, patch);
        // Turning Show where I go on is an informed choice — the switch says
        // what it does — so it stands in for the one-time notice. Without
        // this, someone who switches it on later (an under-18 opting in)
        // would never have visits counted. The switch itself saved, so a
        // failure here is logged, not shown: visits just stay uncounted until
        // it's recorded (the Home notice will ask again).
        if (patch.showWhereIGo === true && !next.whereIGoNoticeSeen) {
          await store.markNoticeSeen(userId).catch((err: unknown) => {
            toUserMessageAllowingDbGuard(err, undefined, '[circle] mark notice seen from switch');
          });
        }
        afterFollowChange();
        // Going open lets everyone waiting in, so the lists have moved.
        if (patch.isPrivate === false) void loadLists();
      } catch (err) {
        showAlert("Couldn't save that", toUserMessageAllowingDbGuard(err, 'Please try again in a moment.', '[circle] update sharing'));
      } finally {
        setSavingSetting(false);
      }
    },
    [userId, savingSetting, afterFollowChange, loadLists, showAlert],
  );

  const onPrivateChange = useCallback(
    (isPrivate: boolean) => {
      if (isPrivate) {
        void saveSetting({ isPrivate: true });
        return;
      }
      showConfirm(
        'Make your account open?',
        "Anyone can follow you without asking, and every follower sees where you go. Anyone waiting for you to accept will be let in.",
        [
          { text: 'Make it open', onPress: () => void saveSetting({ isPrivate: false }) },
          { text: 'Keep it private', style: 'cancel' },
        ],
      );
    },
    [saveSetting, showConfirm],
  );

  // ── Sections ──────────────────────────────────────────────────────────────

  /** Asks for contacts only now, on the tap, then checks them. */
  const checkContacts = useCallback(async () => {
    if (contactsInFlight.current || !userId) return;
    contactsInFlight.current = true;
    const forUser = userId;
    setContactsError(null);
    try {
      let access = await getContactsAccess();
      if (access === 'undetermined' || access === 'denied') access = await requestContactsAccess();
      if (access !== 'granted') {
        setContactsState('off');
        return;
      }
      setContactsState('checking');
      const found = await findContactsOnCerviced();
      // Signed into a different account meanwhile: this result isn't theirs.
      if (userIdRef.current !== forUser) return;
      rememberContactMatches(forUser, found);
      setContactMatches(found);
      setContactsState('done');
    } catch (err) {
      if (userIdRef.current !== forUser) return;
      setContactsError(
        isContactsLimitError(err)
          ? "You've checked a lot of contacts today. Please try again tomorrow."
          : toUserMessageAllowingDbGuard(err, "Couldn't check your contacts just now. Please try again.", '[circle] contacts'),
      );
      setContactsState('error');
    } finally {
      contactsInFlight.current = false;
    }
  }, [userId]);

  const sections = useMemo<Section[]>(() => {
    if (inSearch) {
      const data: Row[] = results.map((person) => ({ kind: 'result', key: `r-${person.userId}`, person }));
      if (data.length === 0 && !searching) {
        data.push({
          kind: 'note',
          key: 'r-empty',
          text: searchError ?? `Nobody called "${trimmed}" yet. Try their first name, or check the spelling.`,
        });
      }
      return [{ key: 'results', title: 'PEOPLE', data }];
    }

    const out: Section[] = [];
    if (requests.length > 0) {
      out.push({
        key: 'requests',
        title: `REQUESTS · ${requests.length}`,
        data: requests.map((entry) => ({ kind: 'request', key: `q-${entry.userId}`, entry })),
      });
    }
    if (contactsState === 'done') {
      out.push({
        key: 'contacts',
        title: `IN YOUR CONTACTS · ${contactMatches.length}`,
        data:
          contactMatches.length > 0
            ? contactMatches.map((person) => ({ kind: 'result', key: `c-${person.userId}`, person, contactName: person.contactName }))
            : [{ kind: 'note', key: 'c-empty', text: 'Nobody in your contacts is on CERVICED yet, or they’ve chosen not to be found by number.' }],
      });
    } else if (contactsState !== 'dismissed') {
      out.push({ key: 'contacts', title: 'CONTACTS', data: [{ kind: 'contacts', key: 'contacts' }] });
    }
    out.push({ key: 'sharing', title: 'YOUR SHARING', data: [{ kind: 'sharing', key: 'sharing' }] });
    if (listsState === 'error') {
      out.push({
        key: 'lists-error',
        title: 'FOLLOWING',
        data: [{ kind: 'retry', key: 'lists-error', text: "Couldn't load who you follow." }],
      });
      return out;
    }
    if (listsState === 'loading') return out;
    out.push({
      key: 'following',
      title: `FOLLOWING · ${following.length}`,
      data:
        following.length > 0
          ? following.map((entry) => ({ kind: 'following', key: `g-${entry.userId}`, entry }))
          : [{ kind: 'note', key: 'g-empty', text: 'Search for someone by name to follow them.' }],
    });
    out.push({
      key: 'followers',
      title: `FOLLOWERS · ${followers.length}`,
      data:
        followers.length > 0
          ? followers.map((entry) => ({ kind: 'follower', key: `f-${entry.userId}`, entry }))
          : [{ kind: 'note', key: 'f-empty', text: 'Nobody follows you yet.' }],
    });
    return out;
  }, [inSearch, results, searching, searchError, trimmed, requests, contactsState, contactMatches, listsState, following, followers]);

  // ── Rendering ─────────────────────────────────────────────────────────────

  const moreButton = (personId: string, name: string) => (
    <TouchableOpacity
      style={styles.more}
      onPress={() => { hapticLight(); confirmBlock(personId, name); }}
      disabled={busyId === personId}
      activeOpacity={0.5}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Block ${name}`}
    >
      <Ionicons name="ellipsis-horizontal" size={18} color={P.sub} />
    </TouchableOpacity>
  );

  /** `below` puts the actions under the name (two buttons need the width), else beside it. */
  const personRow = (
    personId: string,
    name: string,
    avatarUrl: string | null,
    sub: string | null,
    actions: React.ReactNode,
    below = false,
  ) => {
    const busy = busyId === personId;
    const actionArea = busy
      ? <View style={styles.busy}><ActivityIndicator size="small" color={P.sub} /></View>
      : <View style={styles.actions}>{actions}</View>;
    return (
      <View style={[styles.row, { borderBottomColor: P.sep }]}>
        <Face name={name} avatarUrl={avatarUrl} P={P} />
        <View style={styles.rowText}>
          <Text style={[styles.rowName, { color: P.text }]} numberOfLines={1}>{name}</Text>
          {sub ? <Text style={[styles.rowSub, { color: P.sub }]} numberOfLines={1}>{sub}</Text> : null}
          {below ? <View style={styles.belowActions}>{actionArea}</View> : null}
        </View>
        {below ? null : actionArea}
      </View>
    );
  };

  const renderSharing = () => {
    if (!settings) {
      return (
        <View style={[ui.card, styles.sharingCard, { backgroundColor: P.card, borderColor: P.border }]}>
          {settingsError ? (
            <View style={styles.sharingRetry}>
              <Text style={[ui.body, { color: P.sub, flex: 1 }]}>Couldn't load your sharing settings.</Text>
              <GhostButton small label="Try again" onPress={() => void loadSettings()} P={P} />
            </View>
          ) : (
            <ActivityIndicator color={P.sub} />
          )}
        </View>
      );
    }
    return (
      <View style={[ui.card, styles.sharingCard, { backgroundColor: P.card, borderColor: P.border }]}>
        <SwitchRow
          title="Show where I go"
          sub={
            settings.showWhereIGo
              ? "People who follow you see your face on providers you recommend or have booked, including past appointments, and how many times you've been. Never which service you had."
              : 'Nobody sees where you go, recommends included.'
          }
          value={settings.showWhereIGo}
          onChange={(v) => void saveSetting({ showWhereIGo: v })}
          disabled={savingSetting}
          P={P}
        />
        <View style={[styles.divider, { backgroundColor: P.sep }]} />
        <SwitchRow
          title="Private account"
          sub={
            settings.isPrivate
              ? 'People ask to follow you, and you choose who. Anyone already following you stays until you remove them.'
              : 'Anyone can follow you without asking.'
          }
          value={settings.isPrivate}
          onChange={onPrivateChange}
          disabled={savingSetting || settings.isMinor}
          P={P}
        />
        <View style={[styles.divider, { backgroundColor: P.sep }]} />
        <SwitchRow
          title="Findable by phone number"
          sub="People who have the number on your profile in their contacts can find you."
          value={settings.findableByPhone}
          onChange={(v) => void saveSetting({ findableByPhone: v })}
          disabled={savingSetting || settings.isMinor}
          P={P}
        />
        {settings.isMinor ? (
          <Note
            icon="lock-closed-outline"
            text="Because you're under 18, your account stays private and people can't find you by your number."
            P={P}
          />
        ) : null}
      </View>
    );
  };

  const renderContactsCard = () => {
    if (contactsState === 'checking') {
      return (
        <View style={[styles.contactsCard, { backgroundColor: P.accent }]}>
          <ActivityIndicator color={P.onAccent} />
          <Text style={[ui.body, { color: P.onAccent, textAlign: 'center' }]}>Checking your contacts…</Text>
        </View>
      );
    }
    if (contactsState === 'off') {
      return (
        <View style={[ui.card, styles.contactsOff, { backgroundColor: P.card, borderColor: P.border }]}>
          <Text style={[ui.body, { color: P.text }]}>
            CERVICED can't see your contacts. You can let it in Settings, or find people by name above.
          </Text>
          <View style={styles.pair}>
            <GhostButton small label="Open Settings" onPress={() => { void Linking.openSettings(); }} P={P} />
            <GhostButton small label="Not now" onPress={() => setContactsState('dismissed')} P={P} />
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.contactsCard, { backgroundColor: P.accent }]}>
        <Text style={[styles.contactsKick, { color: P.onAccent }]}>CONTACTS</Text>
        <Text style={[styles.contactsTitle, { color: P.onAccent }]}>See who you know here</Text>
        <Text style={[ui.body, { color: P.onAccent, opacity: 0.9 }]}>
          CERVICED scrambles phone numbers on your phone before comparing them. Your address book is never saved.
        </Text>
        {contactsState === 'error' && contactsError ? (
          <Text style={[ui.body, { color: P.onAccent }]}>{contactsError}</Text>
        ) : null}
        <View style={styles.pair}>
          <TouchableOpacity
            style={[styles.contactsBtn, { backgroundColor: P.onAccent, borderColor: P.onAccent }]}
            onPress={() => { hapticLight(); void checkContacts(); }}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <Text style={[styles.contactsBtnText, { color: P.accent }]}>
              {contactsState === 'error' ? 'TRY AGAIN' : 'ALLOW CONTACTS'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.contactsBtn, { borderColor: P.onAccent }]}
            onPress={() => { hapticLight(); setContactsState('dismissed'); }}
            activeOpacity={0.6}
            accessibilityRole="button"
          >
            <Text style={[styles.contactsBtnText, { color: P.onAccent }]}>NOT NOW</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: Row }) => {
    switch (item.kind) {
      case 'sharing':
        return renderSharing();
      case 'contacts':
        return renderContactsCard();
      case 'note':
        return <Text style={[ui.body, styles.note, { color: P.sub }]}>{item.text}</Text>;
      case 'retry':
        return (
          <View style={styles.sharingRetry}>
            <Text style={[ui.body, { color: P.sub, flex: 1 }]}>{item.text}</Text>
            <GhostButton
              small
              label="Try again"
              onPress={() => { setListsState('loading'); void loadLists(); }}
              P={P}
            />
          </View>
        );
      case 'result': {
        const p = item.person;
        const action = personAction(p);
        const label = PERSON_ACTION_LABEL[action];
        const button =
          action === 'follow' || action === 'followBack' ? (
            <PrimaryButton small label={label} onPress={() => void follow(p)} P={P} accessibilityLabel={`${label} ${p.name}`} />
          ) : (
            <GhostButton
              small
              label={label}
              onPress={() => confirmUnfollow(p.userId, p.name, action === 'requested')}
              P={P}
              accessibilityLabel={`${label} ${p.name}. Double tap to change.`}
            />
          );
        // The account's own name leads: numbers aren't verified, so the
        // contact's name is only a hint, never a claim of who this is.
        const sub = [
          item.contactName ? `In your contacts as ${item.contactName}` : null,
          p.followsMe === 'accepted' ? 'Follows you' : null,
        ].filter(Boolean).join(' · ') || null;
        return personRow(
          p.userId,
          p.name,
          p.avatarUrl,
          sub,
          <>{button}{moreButton(p.userId, p.name)}</>,
        );
      }
      case 'request': {
        const e = item.entry;
        return personRow(
          e.userId,
          e.name,
          e.avatarUrl,
          'Wants to follow you',
          <View style={styles.pair}>
            <PrimaryButton small label="Accept" onPress={() => void respond(e, true)} P={P} accessibilityLabel={`Accept ${e.name}`} />
            <GhostButton small label="Decline" onPress={() => void respond(e, false)} P={P} accessibilityLabel={`Decline ${e.name}`} />
          </View>,
          true,
        );
      }
      case 'following': {
        const e = item.entry;
        const pending = e.status === 'pending';
        return personRow(
          e.userId,
          e.name,
          e.avatarUrl,
          pending ? 'Waiting for them to accept' : null,
          <>
            <GhostButton
              small
              label={pending ? 'Requested' : 'Following'}
              onPress={() => confirmUnfollow(e.userId, e.name, pending)}
              P={P}
              accessibilityLabel={`${pending ? 'Requested' : 'Following'} ${e.name}. Double tap to change.`}
            />
            {moreButton(e.userId, e.name)}
          </>,
        );
      }
      case 'follower': {
        const e = item.entry;
        return personRow(
          e.userId,
          e.name,
          e.avatarUrl,
          null,
          <>
            <GhostButton small label="Remove" onPress={() => confirmRemoveFollower(e)} P={P} accessibilityLabel={`Remove ${e.name}`} />
            {moreButton(e.userId, e.name)}
          </>,
        );
      }
    }
  };

  const header = (
    <View style={styles.header}>
      <View style={[styles.search, { backgroundColor: P.card, borderColor: P.border }]}>
        <Ionicons name="search" size={17} color={P.sub} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Find people by name"
          placeholderTextColor={P.sub}
          style={[styles.searchInput, { color: P.text }]}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Find people by name"
        />
        {searching ? <ActivityIndicator size="small" color={P.sub} /> : null}
      </View>
      {!inSearch ? (
        <Text style={[ui.body, { color: P.sub }]}>
          Faces of people you follow show on the providers they recommend or have booked.
        </Text>
      ) : null}
    </View>
  );

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <Text style={[ui.label, styles.sectionLabel, { color: P.sub }]}>{section.title}</Text>
        )}
        ListHeaderComponent={header}
        ListFooterComponent={
          listsState === 'loading' && !inSearch ? <ActivityIndicator color={P.sub} style={styles.footerSpinner} /> : undefined
        }
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
      <DialogHost />
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 48 },
  header: { gap: 10, paddingTop: 12, paddingBottom: 6 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  searchInput: { flex: 1, fontFamily: FONT_BODY, fontSize: 15, paddingVertical: 10 },
  sectionLabel: { marginTop: 22, marginBottom: 6 },
  sharingCard: { padding: 14, gap: 12 },
  sharingRetry: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { height: StyleSheet.hairlineWidth },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: FONT_BODY, fontSize: 15, fontWeight: '700' },
  rowSub: { fontFamily: FONT_BODY, fontSize: 12.5, marginTop: 2 },
  pair: { flexDirection: 'row', gap: 6 },
  more: { paddingHorizontal: 4, paddingVertical: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  belowActions: { flexDirection: 'row', marginTop: 8 },
  // Holds roughly a small button's width so the row doesn't jump while busy.
  busy: { minWidth: 96, height: 32, alignItems: 'center', justifyContent: 'center' },
  face: { width: FACE, height: FACE, borderRadius: FACE / 2, borderWidth: 1 },
  faceInitials: { alignItems: 'center', justifyContent: 'center' },
  faceInitialsText: { fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 0.6 },
  note: { paddingVertical: 8 },
  contactsCard: { borderRadius: 20, padding: 16, gap: 8 },
  contactsKick: { fontFamily: FONT_DISPLAY, fontSize: 10.5, letterSpacing: 1.4, opacity: 0.8 },
  contactsTitle: { fontFamily: FONT_DISPLAY, fontSize: 19, letterSpacing: 0.6 },
  contactsBtn: { borderWidth: 1.5, borderRadius: 100, paddingVertical: 9, paddingHorizontal: 14, marginTop: 4 },
  contactsBtnText: { fontFamily: FONT_DISPLAY, fontSize: 11.5, letterSpacing: 1 },
  contactsOff: { padding: 14, gap: 10 },
  footerSpinner: { marginTop: 24 },
});
