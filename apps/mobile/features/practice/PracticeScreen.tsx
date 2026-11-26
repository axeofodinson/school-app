// Practice a topic (prompt 31): one engine (packages/core/practice), four modes:
// practice set, topic drill, smart review, retry the wrong ones. Pick a mode →
// answer one question at a time with instant feedback (why the right answer is
// right, why your choice is wrong) → a summary by concept. Each finished set (or
// a set left part-way) is one compact practice_attempts row in the user's
// durable queue: it uploads when online and is never lost offline.
//
// Routes: school students `/lesson/<topic>/practice`, prep learners
// `/topic/<topic>/practice`. Keys on a computer: A–D or 1–4 pick, Enter checks
// and moves on, F flags, H opens the tip.
import {
  diagnosticSize,
  FOLLOW_UP_SET_SIZE,
  modeCounts,
  roundPreview,
  retryWrongIds,
  scorePracticeAnswer,
  selectItems,
  summarizeByConcept,
  uuidv4,
  hasAnswer,
  type LessonLang,
  type PracticeAnswer,
  type PracticeMode,
  type PracticePoolItem,
  type SelectReason,
} from '@school/core';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useI18n } from '../../i18n';
import {
  Badge,
  Button,
  EmptyState,
  HeroBand,
  IconButton,
  Meter,
  Reveal,
  Screen,
  SkeletonLines,
  SyncStatusPill,
  Text,
  useCues,
  useTheme,
} from '../../ui';
import { hueForSubject, space, type SubjectHue } from '../../ui/tokens';
import { ERROR_KEYS } from '../scope/LoadState';
import { HeaderBack } from '../learn/HeaderBack';
import { MathContext } from '../learn/LessonText';
import type { PracticeData } from './api';
import { ModePicker } from './ModePicker';
import { QuestionView, readQuestion, type Value } from './QuestionView';
import { SetSummary } from './SetSummary';
import { usePractice } from './usePractice';

function useLang(): LessonLang {
  const { locale } = useI18n();
  return locale === 'ur' ? 'ur' : 'en';
}

interface Run {
  id: string;
  mode: PracticeMode;
  items: PracticePoolItem[];
  reason: SelectReason;
  index: number;
  answers: PracticeAnswer[];
  startedAt: number;
  /** followup mode: the follow-up this set is a round of. */
  followUpId: string | null;
}

/** Opened from Prepare: start this set at once (`?mode=followup&followUp=…&concept=…`). */
export interface AutoStart {
  mode: 'followup' | 'diagnose';
  followUpId: string | null;
  conceptId: string | null;
}

interface Current {
  value: Value;
  result: boolean | null;
  flagged: boolean;
  tip: boolean;
  shownAt: number;
}

const freshCurrent = (): Current => ({
  value: null,
  result: null,
  flagged: false,
  tip: false,
  shownAt: Date.now(),
});

function formatClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Elapsed time of the set, digits only (no tween), ticking once a second. */
function SetClock({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <Badge label={formatClock(now - since)} tone="neutral" icon="timer" />;
}

/** Web keys (Chromebooks, Windows): never while typing in a box, except Enter. */
function usePracticeKeys(on: boolean, handle: (key: string) => void) {
  const ref = useRef(handle);
  useEffect(() => {
    ref.current = handle;
  });
  useEffect(() => {
    if (!on || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const fn = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      if (typing && e.key !== 'Enter') return;
      if (typing && e.key === 'Enter') return; // the text box submits itself
      // Physical keys, so it works on an Urdu keyboard layout too.
      const code = e.code;
      const k =
        code === 'Enter' || code === 'NumpadEnter'
          ? 'enter'
          : /^Key[A-Z]$/.test(code)
            ? code.slice(3).toLowerCase()
            : /^(Digit|Numpad)[1-9]$/.test(code)
              ? code.slice(-1)
              : null;
      if (!k) return;
      ref.current(k);
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [on]);
}

function PracticeBody({
  data,
  root,
  history,
  save,
  sync,
  auto,
}: {
  auto: AutoStart | null;
  data: PracticeData;
  root: string;
  history: ReturnType<typeof usePractice>['history'];
  save: ReturnType<typeof usePractice>['save'];
  sync: ReturnType<typeof usePractice>['sync'];
}) {
  const { t } = useI18n();
  const lang = useLang();
  const router = useRouter();
  const { cue } = useCues();
  const { colours } = useTheme();
  const { width } = useWindowDimensions();
  const hue: SubjectHue = hueForSubject(data.topic.subjectId ?? data.topic.id);
  const conceptOrder = useMemo(
    () => Object.fromEntries(data.concepts.map((c, i) => [c.id, i])),
    [data.concepts],
  );
  const diagSize = diagnosticSize(
    null,
    null,
    new Set(data.pool.map((p) => p.conceptId)).size,
    data.pool.length,
  );
  /** A new set for a mode (no state change: start() and the auto-start share it). */
  const makeRun = (
    mode: PracticeMode,
    opts: { conceptId?: string; retryIds?: string[]; followUpId?: string | null } = {},
  ): { run: Run | null; fallback: boolean } => {
    const sel = selectItems(data.pool, history, {
      mode,
      conceptIds: opts.conceptId ? [opts.conceptId] : undefined,
      retryIds: opts.retryIds,
      size: mode === 'followup' ? FOLLOW_UP_SET_SIZE : mode === 'diagnose' ? diagSize : undefined,
      conceptOrder,
      now: Date.now(),
    });
    if (!sel.items.length) return { run: null, fallback: false };
    return {
      fallback: sel.reason === 'fallback',
      run: {
        id: uuidv4(),
        mode,
        items: sel.items,
        reason: sel.reason,
        index: 0,
        answers: [],
        startedAt: Date.now(),
        followUpId: mode === 'followup' ? (opts.followUpId ?? null) : null,
      },
    };
  };
  // Opened from Prepare: the follow-up round / diagnostic starts at once.
  const [run, setRun] = useState<Run | null>(() =>
    auto?.mode === 'followup' && auto.conceptId
      ? makeRun('followup', { conceptId: auto.conceptId, followUpId: auto.followUpId }).run
      : auto?.mode === 'diagnose'
        ? makeRun('diagnose').run
        : null,
  );
  const [cur, setCur] = useState<Current>(freshCurrent);
  const [done, setDone] = useState<Run | null>(null);
  const [timer, setTimer] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const savedIds = useRef(new Set<string>());

  const title = (lang === 'ur' ? data.topic.titleUr : null) || data.topic.titleEn;
  const conceptTitle = useCallback(
    (id: string | null) => {
      const c = data.concepts.find((x) => x.id === id);
      return c
        ? (lang === 'ur' ? c.titleUr : null) || c.titleEn
        : t('student.practice.otherConcept');
    },
    [data.concepts, lang, t],
  );
  const [openedAt] = useState(() => Date.now());
  const counts = useMemo(
    () => modeCounts(data.pool, history, openedAt),
    [data.pool, history, openedAt],
  );
  const conceptChips = useMemo(
    () =>
      data.concepts.map((c) => ({
        id: c.id,
        title: (lang === 'ur' ? c.titleUr : null) || c.titleEn,
        count: data.pool.filter((p) => p.conceptId === c.id).length,
      })),
    [data.concepts, data.pool, lang],
  );

  const exitTo = `${root}/${data.topic.id}` as Href;
  const leave = () => (router.canGoBack() ? router.back() : router.replace(exitTo));
  const lesson = data.hasLesson ? () => router.push(`${root}/${data.topic.id}/read` as Href) : null;

  const prepareHref = (root === '/topic' ? '/prepare' : '/study') as Href;

  const start = (
    mode: PracticeMode,
    opts: { conceptId?: string; retryIds?: string[]; followUpId?: string | null } = {},
  ) => {
    const r = makeRun(mode, opts);
    if (!r.run) {
      setNotice(t('student.practice.nothing'));
      return;
    }
    setNotice(r.fallback ? t('student.practice.reviewFallback') : null);
    setDone(null);
    setRun(r.run);
    setCur(freshCurrent());
  };

  /** Queue what was answered (once per set). */
  const persist = useCallback(
    async (r: Run) => {
      if (!r.answers.length || savedIds.current.has(r.id)) return;
      savedIds.current.add(r.id);
      const row = await save({
        id: r.id,
        mode: r.mode,
        startedAt: r.startedAt,
        answers: r.answers,
        followUpId: r.followUpId,
      });
      if (!row) {
        savedIds.current.delete(r.id);
        setNotice(t('student.practice.saveFailed'));
      }
    },
    [save, t],
  );

  const itemId = run?.items[run.index]?.questionId;
  const item = itemId ? (data.questions[itemId] ?? null) : null;

  const check = () => {
    if (!run || !item || cur.result !== null || !hasAnswer(cur.value)) return;
    const ok = scorePracticeAnswer(item, cur.value) === true;
    cue(ok ? 'ding' : 'pop');
    const answer: PracticeAnswer = {
      questionId: item.questionId,
      version: item.version,
      value: typeof cur.value === 'string' ? cur.value.trim() : (cur.value as boolean),
      correct: ok,
      ms: Date.now() - cur.shownAt,
      flagged: cur.flagged,
      tip: cur.tip,
    };
    setCur((c) => ({ ...c, result: ok }));
    setRun({ ...run, answers: [...run.answers, answer] });
  };

  const next = () => {
    if (!run || cur.result === null) return;
    if (run.index + 1 >= run.items.length) {
      setRun(null);
      setDone(run);
      persist(run).catch(() => undefined);
      return;
    }
    setRun({ ...run, index: run.index + 1 });
    setCur(freshCurrent());
  };

  /** Flag "check this question"; after Check it updates the recorded answer too. */
  const toggleFlag = () => {
    const flagged = !cur.flagged;
    setCur((c) => ({ ...c, flagged }));
    if (run && cur.result !== null && run.answers.length) {
      const last = run.answers.length - 1;
      setRun({
        ...run,
        answers: run.answers.map((a, i) => (i === last ? { ...a, flagged } : a)),
      });
    }
  };

  const quit = () => {
    if (run) persist(run).catch(() => undefined);
    setRun(null);
    setCur(freshCurrent());
  };

  const pick = (k: string) => {
    if (!item || cur.result !== null) return;
    if (item.type === 'mcq') {
      const opts = readQuestion(item, lang).options;
      const i = /^[1-9]$/.test(k) ? Number(k) - 1 : k.length === 1 ? k.charCodeAt(0) - 97 : -1;
      const o = opts[i];
      if (o) setCur((c) => ({ ...c, value: o.key }));
    } else if (item.type === 'true_false') {
      if (k === '1' || k === 't' || k === 'a') setCur((c) => ({ ...c, value: true }));
      if (k === '2' || k === 'b') setCur((c) => ({ ...c, value: false }));
    }
  };

  usePracticeKeys(Boolean(run), (k) => {
    if (k === 'enter') return cur.result === null ? check() : next();
    if (k === 'f') return toggleFlag();
    if (k === 'h') return setCur((c) => ({ ...c, tip: true }));
    pick(k);
  });

  // ─────────────────────────── running a set ───────────────────────────
  if (run && item) {
    const n = run.items.length;
    return (
      <MathContext.Provider value={data.math}>
        <Screen
          header={
            <HeroBand hue={hue} pattern="star8" compact>
              <View style={styles.runHead}>
                <IconButton icon="close" label={t('student.practice.stop')} onPress={quit} />
                <View style={styles.flex}>
                  <Text variant="label" numberOfLines={1}>
                    {t(`student.practice.modeName.${run.mode}`)} · {title}
                  </Text>
                </View>
                {timer ? <SetClock since={run.startedAt} /> : null}
                <Text
                  variant="label"
                  script="latin"
                  accessibilityLabel={t('student.practice.progress', {
                    n: run.index + 1,
                    total: n,
                  })}
                >
                  {`${run.index + 1} / ${n}`}
                </Text>
              </View>
              <Meter
                value={(run.index + (cur.result !== null ? 1 : 0)) / n}
                tone="ink"
                height={10}
              />
            </HeroBand>
          }
        >
          {notice ? (
            <Text variant="bodySm" tone="textMuted">
              {notice}
            </Text>
          ) : null}
          <QuestionView
            key={`${run.id}-${item.questionId}`}
            q={item}
            lang={lang}
            conceptTitle={data.concepts.length > 1 ? conceptTitle(item.conceptId) : null}
            value={cur.value}
            onChange={(v) => setCur((c) => ({ ...c, value: v }))}
            result={cur.result}
            onCheck={check}
            onNext={next}
            isLast={run.index + 1 >= n}
            flagged={cur.flagged}
            onFlag={toggleFlag}
            tipOpen={cur.tip}
            onTip={() => setCur((c) => ({ ...c, tip: !c.tip }))}
            onLesson={lesson}
          />
          {Platform.OS === 'web' && width >= 700 ? (
            <Text variant="bodySm" tone="textMuted" style={styles.centre}>
              {t('student.practice.keys')}
            </Text>
          ) : null}
        </Screen>
      </MathContext.Provider>
    );
  }

  // ─────────────────────────── summary / picker ───────────────────────────
  const header: ReactNode = (
    <HeroBand hue={hue} pattern="star8">
      <View style={styles.headRow}>
        <HeaderBack onPress={leave} />
        <View style={styles.flex} />
        {data.fromCache ? (
          <Badge label={t('student.learn.savedCopy')} tone="neutral" icon="cloudOff" />
        ) : null}
        {sync.pending ? (
          <SyncStatusPill status={sync.status} pending={sync.pending} onRetry={sync.flushNow} />
        ) : null}
      </View>
      <Reveal index={0} rise={8}>
        <Text variant="label" numberOfLines={1}>
          {[data.topic.subjectName, t('student.practice.title')].filter(Boolean).join(' · ')}
        </Text>
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
      </Reveal>
    </HeroBand>
  );

  if (done) {
    const wrong = retryWrongIds(done.answers);
    const round = done.mode === 'followup' ? roundPreview(done.answers) : null;
    return (
      <MathContext.Provider value={data.math}>
        <Screen header={header}>
          {round || done.mode === 'diagnose' ? (
            <View
              style={[
                styles.notice,
                {
                  backgroundColor:
                    round === 'pass' || done.mode === 'diagnose'
                      ? colours.correctSoft
                      : colours.accentSoft,
                },
              ]}
            >
              <Text variant="label">
                {t(
                  done.mode === 'diagnose'
                    ? 'student.followUps.afterDiagnose'
                    : round === 'pass'
                      ? 'student.followUps.afterPass'
                      : round === 'tooFew'
                        ? 'student.followUps.afterTooFew'
                        : 'student.followUps.afterNotYet',
                )}
              </Text>
              <Button
                title={t('student.followUps.toPrepare')}
                icon="forward"
                variant="secondary"
                size="sm"
                onPress={() => router.replace(prepareHref)}
                style={styles.noticeBtn}
              />
            </View>
          ) : null}
          <SetSummary
            answers={done.answers}
            byConcept={summarizeByConcept(done.answers, done.items)}
            conceptTitle={conceptTitle}
            hue={hue}
            sync={sync.status}
            pending={sync.pending}
            onRetrySync={sync.flushNow}
            onRetryWrong={wrong.length ? () => start('retry', { retryIds: wrong }) : null}
            onDrill={(c) => start('drill', { conceptId: c })}
            onAnother={() => {
              setDone(null);
              setNotice(null);
            }}
            onDone={leave}
          />
        </Screen>
      </MathContext.Provider>
    );
  }

  return (
    <Screen header={header}>
      {!data.pool.length ? (
        <EmptyState
          icon="pencil"
          title={t('student.practice.empty')}
          body={t('student.practice.emptyBody')}
          action={
            lesson ? (
              <Button title={t('student.practice.seeLesson')} icon="book" onPress={lesson} />
            ) : undefined
          }
        />
      ) : (
        <>
          {notice ? (
            <View style={[styles.notice, { backgroundColor: colours.accentSoft }]}>
              <Text variant="bodySm">{notice}</Text>
            </View>
          ) : null}
          <View style={[styles.diag, { borderColor: colours.border }]}>
            <View style={styles.flex}>
              <Text variant="heading">{t('student.followUps.diagnoseTitle')}</Text>
              <Text variant="bodySm" tone="textMuted">
                {t('student.followUps.diagnoseBody', { count: diagSize })}
              </Text>
            </View>
            <Button
              title={t('student.followUps.diagnoseStart')}
              icon="search"
              variant="secondary"
              onPress={() => start('diagnose')}
            />
          </View>
          <ModePicker
            counts={counts}
            concepts={conceptChips}
            hue={hue}
            timer={timer}
            onTimer={setTimer}
            onStart={(mode, conceptId) => start(mode, { conceptId })}
          />
        </>
      )}
    </Screen>
  );
}

/** `/lesson/[topicId]/practice` (students) and `/topic/[topicId]/practice` (prep). */
export function PracticeScreen({ root = '/lesson' }: { root?: string }) {
  const { topicId, mode, followUp, concept } = useLocalSearchParams<{
    topicId: string;
    mode?: string;
    followUp?: string;
    concept?: string;
  }>();
  const auto = useMemo<AutoStart | null>(
    () =>
      mode === 'followup' || mode === 'diagnose'
        ? { mode, followUpId: followUp ?? null, conceptId: concept ?? null }
        : null,
    [mode, followUp, concept],
  );
  const { t } = useI18n();
  const router = useRouter();
  const { state, history, reload, save, sync } = usePractice(topicId);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace(`${root}/${topicId}` as Href);

  if (state.status === 'ready' && state.data !== 'notReady')
    return (
      <PracticeBody
        data={state.data}
        root={root}
        history={history}
        save={save}
        sync={sync}
        auto={auto}
      />
    );

  let body: ReactNode;
  if (state.status === 'loading') body = <SkeletonLines lines={6} />;
  else if (state.status === 'error')
    body = state.notFound ? (
      <EmptyState icon="book" title={t('student.learn.gone')} body={t('student.learn.goneBody')} />
    ) : (
      <EmptyState
        icon="cloudOff"
        title={t(
          state.error === 'network' ? 'student.practice.offlineNoCopy' : 'student.learn.loadError',
        )}
        body={t(
          state.error === 'network'
            ? 'student.practice.offlineNoCopyBody'
            : ERROR_KEYS[state.error],
        )}
        action={<Button title={t('student.learn.retry')} variant="secondary" onPress={reload} />}
      />
    );
  else
    body = (
      <EmptyState
        icon="clock"
        title={t('student.learn.notReady')}
        body={t('student.learn.notReadyBody')}
      />
    );
  return (
    <Screen
      header={
        <HeroBand compact>
          <HeaderBack onPress={back} />
        </HeroBand>
      }
    >
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  runHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  centre: { textAlign: 'center' },
  notice: { padding: space.md, borderRadius: 12, gap: space.sm },
  noticeBtn: { alignSelf: 'flex-start' },
  diag: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
});
