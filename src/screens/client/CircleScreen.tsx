// src/screens/client/CircleScreen.tsx
//
// Your circle: find people from your contacts (the only way to find anyone:
// the search box filters your own contacts, never everyone on CERVICED),
// answer follow requests, follow back the people
// who follow you, and the three sharing switches (Private account, Show
// where I go, Findable by phone number). Reached from Beauty Profile.
// Contacts are only read after a tap on "Allow contacts" — see
// src/features/social/contacts.ts.
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
  unblockPerson,
  blockPerson,
  getMyPeople,
  removeFollower,
  requestFollow,
  respondFollowRequest,
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
import type { FollowStatus, PersonListEntry, PersonSummary, SocialSettingsUpdate } from '../../features/social/types';
import {
  cachedContacts,
  findContactsOnCerviced,
  getContactsAccess,
  inviteContact,
  isContactsLimitError,
  rememberContacts,
  requestContactsAccess,
  savedNameLine,
  searchContacts,
  type ContactMatchResult,
  type InviteContact,
} from '../../features/social/contacts';
import { logger } from '../../utils/logger';
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
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

const FACE = 42;
/** Invite rows shown at first, and added per "Show more". */
const INVITES_PAGE = 25;

type Row =
  | { kind: 'result'; key: string; person: ContactMatchResult }
  | { kind: 'contacts'; key: string }
  | { kind: 'invite'; key: string; contact: InviteContact }
  | { kind: 'moreInvites'; key: string; left: number }
  | { kind: 'request'; key: string; entry: PersonListEntry }
  | { kind: 'following'; key: string; entry: PersonListEntry }
  | { kind: 'follower'; key: string; entry: PersonListEntry }
  | { kind: 'blocked'; key: string; entry: PersonListEntry }
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
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
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
  // Loaded on its own: until migration 20261109130000 is applied the server
  // doesn't know this list, and that mustn't take the other lists down.
  const [blocked, setBlocked] = useState<PersonListEntry[]>([]);
  const loadSeq = useRef(0);

  // Contacts: nothing is read until "Allow contacts". The last result is
  // kept in memory for the app session (contacts.ts), since the server
  // allows 3000 numbers a day and a re-send would spend it again.
  type ContactsState = 'idle' | 'checking' | 'done' | 'off' | 'error' | 'dismissed';
  const cachedContactsResult = userId ? cachedContacts(userId) : null;
  const [contactsState, setContactsState] = useState<ContactsState>(cachedContactsResult ? 'done' : 'idle');
  const [contactMatches, setContactMatches] = useState<ContactMatchResult[]>(cachedContactsResult?.matches ?? []);
  // Address-book names, on the phone only (contacts.ts): never sent anywhere.
  const [contactInvites, setContactInvites] = useState<InviteContact[]>(cachedContactsResult?.invites ?? []);
  const [invitesShown, setInvitesShown] = useState(INVITES_PAGE);
  const [contactsError, setContactsError] = useState<string | null>(null);
  // Filters the contacts already on this phone; nothing is sent anywhere.
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();
  const searching = contactsState === 'done' && trimmedQuery.length > 0;
  const shownContacts = useMemo(
    () => searchContacts({ matches: contactMatches, invites: contactInvites }, trimmedQuery),
    [contactMatches, contactInvites, trimmedQuery],
  );
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

  // userId of the row whose button is mid-request, so it can't be double-tapped.
  const [busyId, setBusyId] = useState<string | null>(null);

  // My follow of each person, so a follower's row can offer Follow back.
  const myStatusById = useMemo(
    () => {
      const byId = new Map<string, FollowStatus>();
      for (const entry of following) if (entry.status !== 'blocked') byId.set(entry.userId, entry.status);
      return byId;
    },
    [following],
  );

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

  const loadBlocked = useCallback(async () => {
    try {
      setBlocked(await getMyPeople('blocked'));
    } catch (err) {
      // Not shown: an empty Blocked section is the honest fallback.
      toUserMessageAllowingDbGuard(err, undefined, '[circle] load blocked list');
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
      void loadBlocked();
      void loadSettings();
    }, [loadLists, loadBlocked, loadSettings]),
  );

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
            ? tr('shared.newc2.requestSent', { name: firstName(person.name) })
            : tr('shared.newc2.nowFollowing', { name: firstName(person.name) }),
          'success',
        );
      }),
    [runForRow, afterFollowChange, showToast],
  );

  const confirmUnfollow = useCallback(
    (personId: string, name: string, pending: boolean) => {
      const first = firstName(name);
      showConfirm(
        pending ? tr('shared.newc2.cancelRequestQ', { name: first }) : tr('shared.newc2.unfollowQ', { name: first }),
        pending ? undefined : tr('shared.newc2.stopSeeing', { name: first }),
        [
          {
            text: pending ? 'Cancel request' : 'Unfollow',
            style: 'destructive',
            onPress: () =>
              void runForRow(personId, "Couldn't unfollow", '[circle] unfollow', async () => {
                await unfollowPerson(personId);
                setContactMatches((list) => withMyStatus(list, personId, null));
                setFollowing((list) => withoutPerson(list, personId));
                afterFollowChange();
              }),
          },
          { text: tr('maintenance.menu.keep'), style: 'cancel' },
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
        tr('shared.newc2.removeQ', { name: first }),
        open
          ? tr('shared.newc2.removeOpen', { name: first })
          : tr('shared.newc2.removePrivate', { name: first }),
        [
          {
            text: tr('common.remove'),
            style: 'destructive',
            onPress: () =>
              void runForRow(entry.userId, "Couldn't remove", '[circle] remove follower', async () => {
                await removeFollower(entry.userId);
                setFollowers((list) => withoutPerson(list, entry.userId));
                setContactMatches((list) => list.map((p) => (p.userId === entry.userId ? { ...p, followsMe: null } : p)));
                afterFollowChange();
              }),
          },
          { text: tr('maintenance.menu.keep'), style: 'cancel' },
        ],
      );
    },
    [settings, showConfirm, runForRow, afterFollowChange],
  );

  const confirmBlock = useCallback(
    (personId: string, name: string) => {
      const first = firstName(name);
      showConfirm(
        tr('shared.newc2.blockQ', { name: first }),
        tr('shared.newc2.blockBody', { name: first }),
        [
          {
            text: tr('shared.newc.block'),
            style: 'destructive',
            onPress: () =>
              void runForRow(personId, "Couldn't block", '[circle] block person', async () => {
                await blockPerson(personId);
                setContactMatches((list) => withoutPerson(list, personId));
                setRequests((list) => withoutPerson(list, personId));
                setFollowing((list) => withoutPerson(list, personId));
                setFollowers((list) => withoutPerson(list, personId));
                setBlocked((list) => withPersonFirst(list, {
                  userId: personId, name, avatarUrl: null, status: 'blocked', since: new Date().toISOString(),
                }));
                afterFollowChange();
                showToast(tr('shared.newc2.isBlocked', { name: first }), 'info');
              }),
          },
          { text: tr('common.cancel'), style: 'cancel' },
        ],
      );
    },
    [showConfirm, runForRow, afterFollowChange, showToast],
  );

  const confirmUnblock = useCallback(
    (entry: PersonListEntry) => {
      const first = firstName(entry.name);
      showConfirm(
        tr('shared.newc2.unblockQ', { name: first }),
        tr('shared.newc2.unblockBody', { name: first }),
        [
          {
            text: tr('shared.newc.unblock'),
            onPress: () =>
              void runForRow(entry.userId, "Couldn't unblock", '[circle] unblock person', async () => {
                await unblockPerson(entry.userId);
                setBlocked((list) => withoutPerson(list, entry.userId));
                afterFollowChange();
              }),
          },
          { text: tr('shared.newc.keepBlocked'), style: 'cancel' },
        ],
      );
    },
    [showConfirm, runForRow, afterFollowChange],
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
        showAlert(tr('shared.newc.couldnTSaveThat'), toUserMessageAllowingDbGuard(err, 'Please try again in a moment.', '[circle] update sharing'));
      } finally {
        setSavingSetting(false);
      }
    },
    [userId, savingSetting, afterFollowChange, loadLists, showAlert],
  );

  // Under-18s start with this off; turning it on gets a confirm first
  // (decided 2026-11-08), in line with not nudging children to share more.
  const onShowWhereIGoChange = useCallback(
    (on: boolean) => {
      if (!on || !settings?.isMinor) {
        void saveSetting({ showWhereIGo: on });
        return;
      }
      showConfirm(
        tr('shared.newc.showWhereIGo2'),
        tr('shared.newc.fromNowOnPeopleYouAccept'),
        [
          { text: tr('maintenance.turnOn'), onPress: () => void saveSetting({ showWhereIGo: true }) },
          { text: tr('common.notNow'), style: 'cancel' },
        ],
      );
    },
    [settings?.isMinor, saveSetting, showConfirm],
  );

  const onPrivateChange = useCallback(
    (isPrivate: boolean) => {
      if (isPrivate) {
        void saveSetting({ isPrivate: true });
        return;
      }
      showConfirm(
        tr('shared.newc.makeYourAccountOpen'),
        tr('shared.newc.anyoneCanFollowYouWithoutAsking'),
        [
          { text: tr('shared.newc.makeItOpen'), onPress: () => void saveSetting({ isPrivate: false }) },
          { text: tr('shared.newc.keepItPrivate'), style: 'cancel' },
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
      rememberContacts(forUser, found);
      setContactMatches(found.matches);
      setContactInvites(found.invites);
      setContactsState('done');
    } catch (err) {
      if (userIdRef.current !== forUser) return;
      setContactsError(
        isContactsLimitError(err)
          ? tr('shared.newc.youVeCheckedALotOf')
          : toUserMessageAllowingDbGuard(err, "Couldn't check your contacts just now. Please try again.", '[circle] contacts'),
      );
      setContactsState('error');
    } finally {
      contactsInFlight.current = false;
    }
  }, [userId]);

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    // While searching, only your contacts show: the matches and the invites.
    if (searching) {
      const { matches, invites } = shownContacts;
      if (matches.length === 0 && invites.length === 0) {
        out.push({
          key: 'contacts',
          title: 'CONTACTS',
          data: [{ kind: 'note', key: 's-empty', text: tr('shared.newc2.noContactMatch', { query: trimmedQuery }) }],
        });
        return out;
      }
      if (matches.length > 0) {
        out.push({
          key: 'contacts',
          title: tr('shared.newc2.onCerviced', { count: matches.length }),
          data: matches.map((person) => ({ kind: 'result', key: `c-${person.userId}`, person })),
        });
      }
      if (invites.length > 0) {
        const shown = invites.slice(0, invitesShown);
        const data: Row[] = shown.map((contact) => ({ kind: 'invite', key: `i-${contact.key}`, contact }));
        if (invites.length > shown.length) data.push({ kind: 'moreInvites', key: 'i-more', left: invites.length - shown.length });
        out.push({ key: 'invites', title: tr('shared.newc2.invite', { count: invites.length }), data });
      }
      return out;
    }
    if (requests.length > 0) {
      out.push({
        key: 'requests',
        title: tr('shared.newc2.requests', { count: requests.length }),
        data: requests.map((entry) => ({ kind: 'request', key: `q-${entry.userId}`, entry })),
      });
    }
    if (contactsState === 'done') {
      out.push({
        key: 'contacts',
        title: tr('shared.newc2.onCerviced', { count: contactMatches.length }),
        data:
          contactMatches.length > 0
            ? contactMatches.map((person) => ({ kind: 'result', key: `c-${person.userId}`, person }))
            : [{ kind: 'note', key: 'c-empty', text: tr('shared.newc.noneOfYourContactsAreOn') }],
      });
      if (contactInvites.length > 0) {
        const shown = contactInvites.slice(0, invitesShown);
        const left = contactInvites.length - shown.length;
        const data: Row[] = shown.map((contact) => ({ kind: 'invite', key: `i-${contact.key}`, contact }));
        if (left > 0) data.push({ kind: 'moreInvites', key: 'i-more', left });
        out.push({ key: 'invites', title: tr('shared.newc2.invite', { count: contactInvites.length }), data });
      }
    } else if (contactsState !== 'dismissed') {
      out.push({ key: 'contacts', title: 'CONTACTS', data: [{ kind: 'contacts', key: 'contacts' }] });
    }
    out.push({ key: 'sharing', title: 'YOUR SHARING', data: [{ kind: 'sharing', key: 'sharing' }] });
    if (listsState === 'error') {
      out.push({
        key: 'lists-error',
        title: 'FOLLOWING',
        data: [{ kind: 'retry', key: 'lists-error', text: tr('shared.newc.couldnTLoadWhoYouFollow') }],
      });
      return out;
    }
    if (listsState === 'loading') return out;
    out.push({
      key: 'following',
      title: tr('shared.newc2.following', { count: following.length }),
      data:
        following.length > 0
          ? following.map((entry) => ({ kind: 'following', key: `g-${entry.userId}`, entry }))
          : [{ kind: 'note', key: 'g-empty', text: tr('shared.newc.findPeopleYouKnowFromYour') }],
    });
    out.push({
      key: 'followers',
      title: tr('shared.newc2.followers', { count: followers.length }),
      data:
        followers.length > 0
          ? followers.map((entry) => ({ kind: 'follower', key: `f-${entry.userId}`, entry }))
          : [{ kind: 'note', key: 'f-empty', text: tr('shared.newc.nobodyFollowsYouYet') }],
    });
    if (blocked.length > 0) {
      out.push({
        key: 'blocked',
        title: tr('shared.newc2.blocked', { count: blocked.length }),
        data: blocked.map((entry) => ({ kind: 'blocked', key: `b-${entry.userId}`, entry })),
      });
    }
    return out;
  }, [searching, shownContacts, trimmedQuery, requests, contactsState, contactMatches, contactInvites, invitesShown, listsState, following, followers, blocked]);

  // ── Rendering ─────────────────────────────────────────────────────────────

  const moreButton = (personId: string, name: string) => (
    <TouchableOpacity
      style={styles.more}
      onPress={() => { hapticLight(); confirmBlock(personId, name); }}
      disabled={busyId === personId}
      activeOpacity={0.5}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={tr('shared.newc2.blockName', { name })}
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
              <Text style={[ui.body, { color: P.sub, flex: 1 }]}>{tr('shared.newc.couldnTLoadYourSharingSettings')}</Text>
              <GhostButton small label={tr('common.tryAgain')} onPress={() => void loadSettings()} P={P} />
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
          title={tr('shared.newc.showWhereIGo')}
          sub={
            settings.showWhereIGo
              ? tr('shared.newc.yourFollowersSeeYourFaceOn')
              : tr('shared.newc.nobodySeesWhereYouGo')
          }
          value={settings.showWhereIGo}
          onChange={onShowWhereIGoChange}
          disabled={savingSetting}
          P={P}
        />
        <View style={[styles.divider, { backgroundColor: P.sep }]} />
        <SwitchRow
          title={tr('shared.newc.privateAccount')}
          sub={
            settings.isPrivate
              ? tr('shared.newc.peopleAskToFollowYouAnd')
              : tr('shared.newc.anyoneCanFollowYou')
          }
          value={settings.isPrivate}
          onChange={onPrivateChange}
          disabled={savingSetting || settings.isMinor}
          P={P}
        />
        <View style={[styles.divider, { backgroundColor: P.sep }]} />
        <SwitchRow
          title={tr('shared.newc.findableByPhoneNumber')}
          sub={tr('shared.newc.peopleWhoHaveYourNumberCan')}
          value={settings.findableByPhone}
          onChange={(v) => void saveSetting({ findableByPhone: v })}
          disabled={savingSetting || settings.isMinor}
          P={P}
        />
        {settings.isMinor ? (
          <Note
            icon="lock-closed-outline"
            text="As you're under 18, your account stays private and can't be found by number."
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
          <Text style={[ui.body, { color: P.onAccent, textAlign: 'center' }]}>{tr('shared.newc.checkingYourContacts')}</Text>
        </View>
      );
    }
    if (contactsState === 'off') {
      return (
        <View style={[ui.card, styles.contactsOff, { backgroundColor: P.card, borderColor: P.border }]}>
          <Text style={[ui.body, { color: P.text }]}>
            {tr('shared.newc.cervicedCanTSeeYourContacts')}
          </Text>
          <View style={styles.pair}>
            <GhostButton small label={tr('shared.newc.openSettings')} onPress={() => { void Linking.openSettings(); }} P={P} />
            <GhostButton small label={tr('common.notNow')} onPress={() => setContactsState('dismissed')} P={P} />
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.contactsCard, { backgroundColor: P.accent }]}>
        <Text style={[styles.contactsKick, { color: P.onAccent }]}>CONTACTS</Text>
        <Text style={[styles.contactsTitle, { color: P.onAccent }]}>{tr('shared.newc.seeWhoYouKnowHere')}</Text>
        <Text style={[ui.body, { color: P.onAccent, opacity: 0.9 }]}>
          {tr('shared.newc.seeWhoSAlreadyHereAnd')}
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
      case 'invite':
        return personRow(
          item.contact.key,
          item.contact.name,
          null,
          null,
          <GhostButton
            small
            label={tr('shared.newc.invite')}
            onPress={() => { void inviteContact(item.contact).catch((err: unknown) => logger.warn('[circle] invite failed', err)); }}
            P={P}
            accessibilityLabel={tr('shared.newc2.inviteName', { name: item.contact.name })}
          />,
        );
      case 'moreInvites':
        return (
          <TouchableOpacity
            style={styles.moreInvites}
            onPress={() => { hapticLight(); setInvitesShown((n) => n + INVITES_PAGE * 2); }}
            activeOpacity={0.6}
            accessibilityRole="button"
          >
            <Text style={[ui.body, { color: P.accentText, fontWeight: '700' }]}>Show more ({item.left})</Text>
          </TouchableOpacity>
        );
      case 'note':
        return <Text style={[ui.body, styles.note, { color: P.sub }]}>{item.text}</Text>;
      case 'retry':
        return (
          <View style={styles.sharingRetry}>
            <Text style={[ui.body, { color: P.sub, flex: 1 }]}>{item.text}</Text>
            <GhostButton
              small
              label={tr('common.tryAgain')}
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
        // "Sis in your contacts · Follows you": the saved name stays on the phone.
        const sub = [savedNameLine(p), p.followsMe === 'accepted' ? 'Follows you' : null]
          .filter(Boolean)
          .join(' · ');
        return personRow(
          p.userId,
          p.name,
          p.avatarUrl,
          sub || null,
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
            <PrimaryButton small label={tr('shared.newc.accept')} onPress={() => void respond(e, true)} P={P} accessibilityLabel={tr('shared.newc2.acceptName', { name: e.name })} />
            <GhostButton small label={tr('shared.newc.decline')} onPress={() => void respond(e, false)} P={P} accessibilityLabel={tr('shared.newc2.declineName', { name: e.name })} />
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
              label={pending ? tr('shared.newc.requested') : tr('shared.newc.following')}
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
        // They follow me, so the same rule as a contact row: Follow back until I do.
        const action = personAction({ myStatus: myStatusById.get(e.userId) ?? null, followsMe: 'accepted' });
        const remove = (
          <GhostButton small label={tr('common.remove')} onPress={() => confirmRemoveFollower(e)} P={P} accessibilityLabel={tr('shared.newc2.removeName', { name: e.name })} />
        );
        if (action === 'followBack') {
          return personRow(
            e.userId,
            e.name,
            e.avatarUrl,
            'Follows you',
            <>
              <View style={styles.pair}>
                <PrimaryButton
                  small
                  label={PERSON_ACTION_LABEL.followBack}
                  onPress={() => void follow({ userId: e.userId, name: e.name, avatarUrl: e.avatarUrl, myStatus: null, followsMe: 'accepted' })}
                  P={P}
                  accessibilityLabel={tr('shared.newc2.followBack', { name: e.name })}
                />
                {remove}
              </View>
              {moreButton(e.userId, e.name)}
            </>,
            true,
          );
        }
        return personRow(
          e.userId,
          e.name,
          e.avatarUrl,
          action === 'following' ? 'You follow each other' : 'Your request is waiting',
          <>
            {remove}
            {moreButton(e.userId, e.name)}
          </>,
        );
      }
      case 'blocked': {
        const e = item.entry;
        return personRow(
          e.userId,
          e.name,
          e.avatarUrl,
          null,
          <GhostButton small label={tr('shared.newc.unblock')} onPress={() => confirmUnblock(e)} P={P} accessibilityLabel={tr('shared.newc2.unblockName', { name: e.name })} />,
        );
      }
    }
  };

  const header = (
    <View style={styles.header}>
      {contactsState === 'done' ? (
        <View style={[styles.search, { backgroundColor: P.card, borderColor: P.border }]}>
          <Ionicons name="search" size={17} color={P.sub} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tr('shared.newc.searchYourContacts')}
            placeholderTextColor={P.sub}
            style={[styles.searchInput, { color: P.text }]}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel={tr('shared.newc.searchYourContacts')}
          />
        </View>
      ) : null}
      {searching ? null : (
        <Text style={[ui.body, { color: P.sub }]}>
          {tr('shared.newc.facesOfPeopleYouFollowShow')}
        </Text>
      )}
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
          listsState === 'loading' ? <ActivityIndicator color={P.sub} style={styles.footerSpinner} /> : undefined
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
  moreInvites: { paddingVertical: 14, alignItems: 'center' },
  contactsCard: { borderRadius: 20, padding: 16, gap: 8 },
  contactsKick: { fontFamily: FONT_DISPLAY, fontSize: 10.5, letterSpacing: 1.4, opacity: 0.8 },
  contactsTitle: { fontFamily: FONT_DISPLAY, fontSize: 19, letterSpacing: 0.6 },
  contactsBtn: { borderWidth: 1.5, borderRadius: 100, paddingVertical: 9, paddingHorizontal: 14, marginTop: 4 },
  contactsBtnText: { fontFamily: FONT_DISPLAY, fontSize: 11.5, letterSpacing: 1 },
  contactsOff: { padding: 14, gap: 10 },
  footerSpinner: { marginTop: 24 },
});
