// Teachers and admins send messages (prompt 15): to a class, one student, or
// (admins only) the whole school. The choices offered follow RLS (db/010: a
// teacher may only message classes they teach and their students), which stays
// the real boundary. The insert carries a client UUID, so a double tap or a
// retry is one message. Push and the in-app toast follow from the insert (the
// send-message-push Edge Function and Realtime). Below: what was sent, with
// how many students have read it (db/029).
import {
  MESSAGE_BODY_MAX,
  MESSAGE_TITLE_MAX,
  uuidv4,
  validateCompose,
  type ComposeError,
  type MessageScope,
} from '@school/core';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListItem,
  Screen,
  SegmentedControl,
  SkeletonLines,
  Text,
  TextField,
  useToast,
} from '../../ui';
import { space } from '../../ui/tokens';
import { useAuth } from '../auth/AuthProvider';
import { ChipPicker } from '../scope/ChipPicker';
import { LoadState } from '../scope/LoadState';
import { loadScope, type Scope } from '../scope/api';
import { useResult } from '../scope/useResult';
import { audienceSize, loadPupils, loadSent, sendMessage, type Pupil } from './api';
import { formatWhen } from './when';

const ERROR_KEY: Record<ComposeError, TKey> = {
  titleEmpty: 'console.messages.errors.titleRequired',
  titleLong: 'console.messages.errors.titleLong',
  bodyEmpty: 'console.messages.errors.bodyRequired',
  bodyLong: 'console.messages.errors.bodyLong',
  noTarget: 'console.messages.errors.classRequired',
};

function SentList({ tick }: { tick: number }) {
  const { t } = useI18n();
  const { state, reload } = useResult(`sent:${tick}`, loadSent);
  return (
    <View style={styles.gap}>
      <Text variant="heading" accessibilityRole="header">
        {t('console.messages.sentTitle')}
      </Text>
      <LoadState state={state} title={t('console.messages.sentLoadError')} onRetry={reload} />
      {state?.status === 'ready' ? (
        state.data.length === 0 ? (
          <EmptyState icon="info" title={t('console.messages.sentEmpty')} />
        ) : (
          state.data.map((m) => (
            <Card key={m.id}>
              <View style={styles.meta}>
                <Badge label={t(`console.messages.scopes.${m.scope}`)} tone="neutral" />
                <Text variant="caption" tone="textMuted">
                  {formatWhen(m.created_at, t)}
                </Text>
                <Badge
                  label={t('console.messages.readBy', { count: m.readCount })}
                  tone={m.readCount > 0 ? 'correct' : 'neutral'}
                  icon="eye"
                />
              </View>
              <Text variant="heading">{m.title}</Text>
              <Text numberOfLines={3}>{m.body}</Text>
            </Card>
          ))
        )
      ) : null}
    </View>
  );
}

function StudentPicker({
  classId,
  yearId,
  value,
  onChange,
}: {
  classId: string;
  yearId: string;
  value: Pupil | null;
  onChange(p: Pupil | null): void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const { state, reload } = useResult(`pupils:${classId}`, () => loadPupils(classId, yearId));
  if (value) {
    return (
      <ListItem
        title={value.name}
        subtitle={t('console.messages.code', { code: value.code })}
        trailing={
          <Button
            title={t('console.messages.form.changeStudent')}
            variant="ghost"
            size="sm"
            onPress={() => onChange(null)}
          />
        }
      />
    );
  }
  if (state?.status !== 'ready') {
    return <LoadState state={state} title={t('console.messages.loadError')} onRetry={reload} />;
  }
  if (state.data.length === 0)
    return <Text tone="textMuted">{t('console.messages.noStudents')}</Text>;
  const q = query.trim().toLowerCase();
  const shown = q
    ? state.data.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
    : state.data;
  return (
    <View style={styles.gap}>
      <TextField
        label={t('console.messages.form.searchStudents')}
        value={query}
        onChangeText={setQuery}
      />
      {shown.length === 0 ? (
        <Text tone="textMuted">{t('console.messages.noStudentMatches', { query })}</Text>
      ) : (
        shown
          .slice(0, 50)
          .map((p) => (
            <ListItem
              key={p.studentId}
              title={p.name}
              subtitle={t('console.messages.code', { code: p.code })}
              onPress={() => onChange(p)}
            />
          ))
      )}
    </View>
  );
}

function Composer({ scope: sc, isAdmin }: { scope: Scope; isAdmin: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const { session } = useAuth();
  const [audience, setAudience] = useState<MessageScope>(sc.classes.length ? 'class' : 'school');
  const [classId, setClassId] = useState<string | null>(
    sc.classes.length === 1 ? sc.classes[0]!.id : null,
  );
  const [pupil, setPupil] = useState<Pupil | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<TKey | null>(null);
  const [sending, setSending] = useState(false);
  const [sentTick, setSentTick] = useState(0);
  const draftId = useRef(uuidv4());

  const targetId =
    audience === 'school' ? null : audience === 'class' ? classId : (pupil?.studentId ?? null);
  const yearId = sc.year?.id ?? null;
  const reach = useResult(`reach:${audience}:${targetId}:${yearId}`, () =>
    audienceSize(audience, targetId, yearId),
  );

  const segments = useMemo(
    () =>
      (isAdmin ? (['school', 'class', 'student'] as const) : (['class', 'student'] as const)).map(
        (v) => ({ value: v, label: t(`console.messages.scopes.${v}`) }),
      ),
    [isAdmin, t],
  );
  const className = sc.classes.find((c) => c.id === classId)?.name ?? '';
  const audienceName =
    audience === 'school'
      ? t('console.messages.audience.school')
      : audience === 'class'
        ? t('console.messages.audience.class', { name: className })
        : t('console.messages.audience.student', { name: pupil?.name ?? '' });

  const onSend = async () => {
    const draft = { scope: audience, targetId, title, body };
    const bad = validateCompose(draft);
    if (bad) {
      setError(
        bad === 'noTarget' && audience === 'student'
          ? 'console.messages.errors.studentRequired'
          : ERROR_KEY[bad],
      );
      return;
    }
    const uid = session?.user.id;
    if (!uid) return;
    setError(null);
    setSending(true);
    const r = await sendMessage(draftId.current, uid, draft);
    setSending(false);
    if (!r.ok) {
      // The draft stays, with the same id: sending again can't make a second copy.
      setError(
        r.error === 'forbidden'
          ? 'console.messages.errors.notAllowed'
          : r.error === 'network'
            ? 'console.messages.errors.network'
            : 'console.messages.errors.unknown',
      );
      return;
    }
    toast(t('console.messages.sent', { audience: audienceName }), 'success');
    draftId.current = uuidv4();
    setTitle('');
    setBody('');
    setSentTick((n) => n + 1);
  };

  const errorParams =
    error === 'console.messages.errors.titleLong'
      ? { max: MESSAGE_TITLE_MAX }
      : error === 'console.messages.errors.bodyLong'
        ? { max: MESSAGE_BODY_MAX }
        : undefined;

  return (
    <View style={styles.wrap}>
      <Card>
        <View style={styles.gap}>
          <Text variant="label">{t('console.messages.form.scope')}</Text>
          <SegmentedControl
            segments={segments}
            value={audience}
            onChange={(v) => {
              setAudience(v);
              setError(null);
            }}
            accessibilityLabel={t('console.messages.form.scope')}
          />
          {audience !== 'school' ? (
            sc.classes.length === 0 ? (
              <Text tone="textMuted">{t('console.messages.noClasses')}</Text>
            ) : (
              <ChipPicker
                label={t('console.messages.form.pickClass')}
                chips={sc.classes.map((c) => ({ value: c.id, label: c.name }))}
                value={classId}
                onChange={(v) => {
                  setClassId(v);
                  setPupil(null);
                }}
              />
            )
          ) : null}
          {audience === 'student' && classId && yearId ? (
            <>
              <Text variant="label">{t('console.messages.form.pickStudent')}</Text>
              <StudentPicker classId={classId} yearId={yearId} value={pupil} onChange={setPupil} />
            </>
          ) : null}
          <TextField
            label={t('console.messages.form.title')}
            placeholder={t('console.messages.form.titlePlaceholder')}
            helper={t('console.messages.form.count', {
              n: title.trim().length,
              max: MESSAGE_TITLE_MAX,
            })}
            value={title}
            maxLength={MESSAGE_TITLE_MAX + 20}
            onChangeText={setTitle}
          />
          <TextField
            label={t('console.messages.form.body')}
            placeholder={t('console.messages.form.bodyPlaceholder')}
            helper={t('console.messages.form.count', {
              n: body.trim().length,
              max: MESSAGE_BODY_MAX,
            })}
            value={body}
            multiline
            numberOfLines={5}
            maxLength={MESSAGE_BODY_MAX + 50}
            onChangeText={setBody}
            style={styles.body}
          />
          {(audience === 'school' || targetId !== null) && reach.state?.status === 'ready' ? (
            <Text tone="textMuted">{t('console.messages.reach', { count: reach.state.data })}</Text>
          ) : null}
          <Text variant="caption" tone="textMuted">
            {t('console.messages.deliveryNote')}
          </Text>
          {error ? (
            <Text tone="wrong" accessibilityLiveRegion="polite">
              {t(error, errorParams)}
            </Text>
          ) : null}
          <Button
            title={t(sending ? 'console.messages.form.sending' : 'console.messages.form.send')}
            icon="forward"
            loading={sending}
            disabled={sending}
            onPress={() => void onSend()}
          />
        </View>
      </Card>
      <SentList tick={sentTick} />
    </View>
  );
}

export function ComposeScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { session, destination } = useAuth();
  const userId = session?.user.id ?? null;
  const isAdmin = destination === 'admin';
  const { state, reload } = useResult(userId ? `msg-scope:${userId}:${isAdmin}` : null, () =>
    loadScope(userId!, isAdmin),
  );
  return (
    <Screen>
      <View style={styles.top}>
        <Button
          title={t('console.messages.back')}
          icon="back"
          variant="ghost"
          size="sm"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>
      <Text variant="title" accessibilityRole="header">
        {t('console.messages.title')}
      </Text>
      <Text tone="textMuted">
        {t(isAdmin ? 'console.messages.subtitleAdmin' : 'console.messages.subtitleTeacher')}
      </Text>
      {state?.status !== 'ready' ? (
        state?.status === 'loading' || !state ? (
          <SkeletonLines lines={4} />
        ) : (
          <LoadState state={state} title={t('console.messages.loadError')} onRetry={reload} />
        )
      ) : !state.data.year && !isAdmin ? (
        <EmptyState
          icon="info"
          title={t('staff.scope.noYear')}
          body={t('staff.scope.noYearTeacher')}
        />
      ) : !isAdmin && state.data.classes.length === 0 ? (
        <EmptyState icon="info" title={t('console.messages.noClasses')} />
      ) : (
        <Composer scope={state.data} isAdmin={isAdmin} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start' },
  wrap: { gap: space.lg },
  gap: { gap: space.sm },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  body: { minHeight: 120 },
});
