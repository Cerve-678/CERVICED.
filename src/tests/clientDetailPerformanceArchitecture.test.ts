import fs from 'fs';
import path from 'path';

const read = (...parts: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

describe('client detail screen performance and safety contracts', () => {
  it('loads booking-detail provider policies in one service call', () => {
    const source = read('screens', 'client', 'BookingDetailScreen.tsx');
    const policyEffect = source.slice(
      source.indexOf('const pid = booking.providerId;'),
      source.indexOf('// Address countdown timer'),
    );

    expect(policyEffect).toContain('getProviderBookingDetailMetadata');
    expect(policyEffect).not.toContain('getProviderReschedulePolicyById');
    expect(policyEffect).not.toContain('getProviderCancellationPolicyById');
    expect(policyEffect).not.toContain('getProviderAddressPolicy(pid)');
  });

  it('loads booking tasks once per focus with stale-response and retry guards', () => {
    const source = read('screens', 'client', 'BookingDetailScreen.tsx');
    const todoLoader = source.slice(
      source.indexOf('// One focus-aware loader owns both to-do requests.'),
      source.indexOf('// Hydrate rated/tipped state from the DB.'),
    );

    expect(todoLoader).toContain('useFocusEffect(useCallback(() =>');
    expect(todoLoader).toContain('Promise.allSettled([');
    expect(todoLoader).toContain('if (!active) return;');
    expect(todoLoader).toContain('setBookingIntakeForm(null)');
    expect(source).toContain('setTodoRetryNonce(value => value + 1)');
    expect(source).not.toContain("navigation.addListener('focus'");
  });

  it('uses the users row as the single beauty-profile source of truth', () => {
    const source = read('screens', 'client', 'BeautyProfileScreen.tsx');

    expect(source).toContain('getUserBeautyProfile(userId)');
    expect(source).toContain('upsertUserBeautyProfile(userId');
    expect(source).not.toContain("from '../../lib/supabase'");
    expect(source).not.toContain('supabase.auth.updateUser');
    expect(source).toContain("We couldn't load your beauty profile.");
    expect(source).toContain('const loadRequestRef = useRef(0)');
    expect(source).toContain('activeUserIdRef.current !== userId');
    expect(source).toContain('setSaved(EMPTY_BEAUTY_DATA)');
    expect(source).toContain("profileOwnerId !== (user?.id ?? null)");
    expect(source).toContain('const draftSnapshot = draft');
    expect(source).toContain('if (savingRef.current) return;');
  });

  it('shows a retryable intake-form load error', () => {
    const source = read('screens', 'client', 'ClientIntakeFormScreen.tsx');

    expect(source).toContain('setLoadError(true)');
    expect(source).toContain('setRetryNonce(value => value + 1)');
    expect(source).toContain("We couldn't load this form.");
  });

  it('probes reschedule dates in bounded batches with an early exit', () => {
    const source = read('screens', 'client', 'RescheduleScreen.tsx');
    const helper = source.slice(
      source.indexOf('async function fetchRealRescheduleDates'),
      source.indexOf('// ── Main Component'),
    );

    expect(helper).toContain('const batchSize = 3');
    expect(helper).toContain('openDates.length >= RESCHEDULE_MAX_DATES');
    expect(helper).toContain('if (!isActive()) return openDates;');
    expect(helper).not.toContain('candidateDates.map(async date');
  });

  it('prevents stale reschedule policy and availability responses crossing routes', () => {
    const source = read('screens', 'client', 'RescheduleScreen.tsx');
    const loader = source.slice(
      source.indexOf('// Load policy and build date options'),
      source.indexOf('const handleDateSelect'),
    );

    expect(source).toContain('}, [bookingId]);');
    expect(loader).toContain('let active = true;');
    // The policy write must stay behind the `active` guard. Its exact
    // formatting is free to change — an UNguarded setReschedulePolicy(policy)
    // is the bug this pins.
    expect(loader).toMatch(/if \(active\)[\s\S]{0,60}setReschedulePolicy\(policy\)/);
    expect(loader).toContain('() => active');
    expect(loader).toContain('return () => { active = false; };');
  });

  it('stops a reschedule inside the notice window at the popup, not the next screen', () => {
    const source = read('screens', 'client', 'BookingDetailScreen.tsx');
    const handler = source.slice(
      source.indexOf('const handleReschedulePress'),
      source.indexOf('[booking, canReschedule, reschedulePolicy, navigation]'),
    );

    // A tap that beats the metadata fetch used to read a null policy from
    // state, skip every check, and push the client into RescheduleScreen —
    // which then blocked them with its own full-screen state instead.
    expect(handler).toContain('await metadataRef.current');

    // An appointment that has already started is further past the notice
    // window, not exempt from it.
    expect(handler).not.toContain('hoursUntil >= 0');
    expect(handler).toContain('hoursUntil < policy.rescheduleNoticeHours');
  });

  it('holds the reschedule picker until the notice policy is known', () => {
    const source = read('screens', 'client', 'RescheduleScreen.tsx');

    // Without this the notice check reads 0 hours while the fetch is in
    // flight, renders the picker, then swaps it for "Too Close to Reschedule".
    expect(source).toContain('const [policyLoaded, setPolicyLoaded] = useState(false);');
    expect(source).toContain('if (!policyLoaded && !hasProviderResponse)');

    // The gate must sit ahead of the block it exists to stop flashing.
    expect(source.indexOf('if (!policyLoaded && !hasProviderResponse)')).toBeLessThan(
      source.indexOf('if (isPastNoticeWindow)'),
    );
  });
});
