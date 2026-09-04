import fs from 'fs';
import path from 'path';

const read = (...parts: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

/**
 * The bug class these guard against: a secondary fetch or write fails, the
 * failure is swallowed, and the UI carries on rendering a state the server
 * never agreed to — an empty conversation list that means "we couldn't
 * check", toggle defaults presented as the user's own saved preferences, or a
 * notification shown as read/deleted when the write was rejected.
 *
 * Each screen must be able to say "that didn't work" rather than falling
 * through to happy-path copy.
 */
describe('secondary fetch and write failures are surfaced, not swallowed', () => {
  const database = read('services', 'databaseService.ts');

  describe('conversation lists', () => {
    it('gives the client message list a real error state with a retry', () => {
      const source = read('screens', 'client', 'MessagesScreen.tsx');

      // The empty catch that made a failed fetch look like an empty inbox.
      expect(source).not.toContain('catch { /* offline — keep whatever we have */ }');
      expect(source).toContain('const [loadError, setLoadError] = useState<string | null>(null)');
      expect(source).toContain('toUserMessage(');
      // A failure must not be able to render the "No messages yet" copy.
      expect(source).toContain('loadError ? (');
      expect(source).toContain("Couldn't load messages");
    });

    it('gives the provider inbox the same treatment, not just the client half', () => {
      const source = read('screens', 'provider', 'ProviderInboxScreen.tsx');

      expect(source).not.toContain("logger.error('[ProviderInbox] load conversations failed:', err)");
      expect(source).toContain('const [loadError,     setLoadError]     = useState<string | null>(null)');
      // Both halves feed one banner: either failing means the list is partial.
      expect(source).toContain('Promise.allSettled([');
      expect(source).toContain("Couldn't load your inbox");
    });
  });

  describe('notification preferences', () => {
    it('makes the service report a failed read instead of returning defaults', () => {
      const section = database.slice(
        database.indexOf('export async function getNotificationPreferences'),
        database.indexOf('/** Count how many users have bookmarked'),
      );

      // Returning DEFAULT_NOTIF_PREFS on error made "we could not read your
      // settings" indistinguishable from "these are your settings" — and the
      // push edge function gates on the real stored value.
      expect(section).not.toContain('if (error) return DEFAULT_NOTIF_PREFS;');
      expect(section).toContain('if (error) throw error;');
      // A write with no session must not resolve as a success.
      expect(section).not.toContain('if (!user) return;');
      expect(section).toContain('throw new Error("Not signed in")');
    });

    it('never renders default toggles as saved preferences after a failed load', () => {
      const source = read('screens', 'client', 'NotificationsSettingsScreen.tsx');

      // Scoped to the preference calls — the bare `.catch(() => {})` on the
      // Haptics calls is a legitimate fire-and-forget, not a swallowed write.
      expect(source).not.toMatch(
        /(get|save)NotificationPreferences\([^)]*\)[\s\S]{0,200}?\.catch\(\(\) => \{\}\)/,
      );
      expect(source).toContain("useState<'loading' | 'ready' | 'error'>('loading')");
      // The toggle rows are gated behind a successful load.
      expect(source).toContain("{loadState === 'ready' && (");
      expect(source).toContain("{loadState === 'error' && (");
    });

    it('never shows the saved footer when the write failed', () => {
      const source = read('screens', 'client', 'NotificationsSettingsScreen.tsx');

      // "Preferences saved automatically." must sit in the else branch of the
      // save-error check, so a failed write can't display it.
      const footer = source.slice(
        source.indexOf('{saveError ? ('),
        source.indexOf('</>'),
      );
      expect(footer).toContain("Your last change hasn't been applied yet.");
      expect(footer).toContain('onPress={retrySave}');
      expect(footer.indexOf('Preferences saved automatically.')).toBeGreaterThan(
        footer.indexOf(') : ('),
      );
      // The flush-on-unmount save still has no UI to report to, but must log.
      expect(source).toContain('saveNotificationPreferences(pendingPrefs.current)');
      expect(source).toContain('flush-on-unmount save failed');
    });
  });

  describe('optimistic notification actions', () => {
    const source = read('screens', 'shared', 'NotificationsScreen.tsx');

    it('rolls back a failed mark-read and delete instead of swallowing', () => {
      // These fire-and-forget catches made the outer try/catch unreachable, so
      // the logger.error below them could never run.
      expect(source).not.toContain('markNotificationRead(notificationId).catch(() => {})');
      expect(source).not.toContain('markAllNotificationsRead().catch(() => {})');
      expect(source).not.toContain('dbDeleteNotification(notificationId).catch(() => {})');

      expect(source).toContain('await markNotificationRead(notificationId)');
      expect(source).toContain('await markAllNotificationsRead()');
      expect(source).toContain('await dbDeleteNotification(notificationId)');

      // Rollback: read flag restored, deleted row re-inserted at its position.
      expect(source).toContain('{ ...n, read: false }');
      expect(source).toContain('next.splice(Math.min(index, next.length), 0, removed)');
      expect(source).toContain('const [actionError, setActionError] = useState<string | null>(null)');
    });

    it('deletes through the RPC, since notifications has no DELETE policy', () => {
      const section = database.slice(
        database.indexOf('export async function deleteNotification'),
        database.indexOf('// INFO PACKS'),
      );

      // A raw .delete() would match zero rows and resolve successfully, so the
      // screen's rollback would never fire.
      expect(section).toContain('supabase.rpc("delete_own_notification"');
      expect(section).not.toContain('.delete()');
      expect(section).toContain('if (error) throw error;');
    });
  });
});
