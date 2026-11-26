// Sign out with unsent work (LMS_AUDIT §3.3, prompt 61). Before a person signs
// out (or taps Switch student), anything still on this device is sent first;
// if that can't happen (offline), a sheet says how much is waiting and that it
// stays safe, sealed to them, until they next sign in on this device. The next
// student sees none of it. The idle sign-out on a shared device never asks: it
// just keeps the work the same way.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { userQueueStores } from '../../lib/userQueue';
import { Button, Icon, Sheet, Text } from '../../ui';
import { space } from '../../ui/tokens';
import { STUDENT_SENDERS } from '../attempts/AttemptSync';
import { ATTENDANCE_SENDERS } from '../attendance/AttendanceSync';
import { useAuth, type SignOutReason } from '../auth/AuthProvider';
import { flushOffline, isUnsent, listOffline } from '../exams/offline';

const SENDERS = { ...STUDENT_SENDERS, ...ATTENDANCE_SENDERS };
/** Don't keep a person waiting at the door: try this long, then ask. */
const TRY_MS = 6_000;

type Ask = { reason: SignOutReason; phase: 'sending' | 'waiting'; count: number };
const Ctx = createContext<(reason?: SignOutReason) => void>(() => undefined);

export function SignOutGuardProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { session, queueStorage, signOut } = useAuth();
  const userId = session?.user.id ?? null;
  const [ask, setAsk] = useState<Ask | null>(null);
  const [leaving, setLeaving] = useState(false);
  // Bumped when the sheet is closed: a send still running then signs nobody out.
  const round = useRef(0);
  const close = useCallback(() => {
    round.current++;
    setAsk(null);
  }, []);

  const unsent = useCallback(async () => {
    if (!userId) return 0;
    const queued = (await userQueueStores(userId).queue.items()).length;
    const exams = (await listOffline(queueStorage)).filter(isUnsent).length;
    return queued + exams;
  }, [userId, queueStorage]);

  const leave = useCallback(
    async (reason: SignOutReason) => {
      setLeaving(true);
      await signOut(reason);
      setLeaving(false);
      setAsk(null);
    },
    [signOut],
  );

  const request = useCallback(
    async (reason: SignOutReason = 'user') => {
      const mine = ++round.current;
      let n = await unsent().catch(() => 0);
      if (!n || !userId) return leave(reason);
      setAsk({ reason, phase: 'sending', count: n });
      const send = (async () => {
        await userQueueStores(userId)
          .queue.flush(SENDERS, { force: true })
          .catch(() => undefined);
        await flushOffline(queueStorage).catch(() => 0);
      })();
      await Promise.race([send, new Promise((r) => setTimeout(r, TRY_MS))]);
      if (round.current !== mine) return; // closed meanwhile: stay signed in
      n = await unsent().catch(() => n);
      if (!n) return leave(reason);
      setAsk({ reason, phase: 'waiting', count: n });
    },
    [unsent, userId, queueStorage, leave],
  );

  const guarded = useCallback((reason?: SignOutReason) => void request(reason), [request]);
  const sending = ask?.phase === 'sending';
  return (
    <Ctx.Provider value={guarded}>
      {children}
      <Sheet
        visible={!!ask}
        onClose={close}
        title={t(sending ? 'auth.unsent.sendingTitle' : 'auth.unsent.title')}
        footer={
          sending ? null : (
            <View style={styles.actions}>
              <Button title={t('auth.unsent.stay')} variant="ghost" onPress={close} />
              <Button
                title={t('auth.unsent.tryAgain')}
                variant="secondary"
                icon="replay"
                onPress={() => ask && guarded(ask.reason)}
              />
              <Button
                title={t('auth.unsent.anyway')}
                loading={leaving}
                onPress={() => ask && void leave(ask.reason)}
              />
            </View>
          )
        }
      >
        <View style={styles.body} accessibilityLiveRegion="polite">
          <Icon name={sending ? 'syncing' : 'cloudOff'} size={28} />
          <Text>
            {sending
              ? t('auth.unsent.sendingBody')
              : t('auth.unsent.body', { count: ask?.count ?? 0 })}
          </Text>
          {sending ? null : <Text tone="textMuted">{t('auth.unsent.safe')}</Text>}
        </View>
      </Sheet>
    </Ctx.Provider>
  );
}

/** Sign out, sending unsent work first (and asking if it can't be sent). */
export function useSignOut(): (reason?: SignOutReason) => void {
  return useContext(Ctx);
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'flex-end' },
});
