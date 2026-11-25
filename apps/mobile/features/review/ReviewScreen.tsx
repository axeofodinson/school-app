// Teacher review queue (prompt 22, wireframe 7.9). Two panes from desktop width:
// the queue on the start side (filters, tabs, progress, rows with bulk select),
// one question on the other. Below that, one pane at a time. Every decision is
// a db/032 RPC; the server decides who may approve, this screen only makes it
// fast: keyboard first on Windows, the cursor moves on by itself, nothing waits
// on a reload.
import {
  DEFAULT_REVIEW_SCOPES,
  REVIEW_TABS,
  approveBlock,
  buildReviewPatch,
  hasUrduGaps,
  leavesTab,
  nextAfterDecision,
  questionLabel,
  reviewProgress,
  reviewView,
  splitMath,
  startingScopes,
  stepId,
  toggleScope,
  type ReviewDecision,
  type ReviewDraft,
  type ReviewItem,
  type ReviewKeyAction,
  type ReviewScope,
  type ReviewTab,
} from '@school/core';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useI18n, type TKey } from '../../i18n';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Meter,
  Reveal,
  Sheet,
  Text,
  TextField,
  TwoPane,
  useLayout,
  useTheme,
  useToast,
} from '../../ui';
import { useEnterStyle } from '../../ui/motion';
import { useFocusRing } from '../../ui/Sticker';
import { radius, space, strokeWidth } from '../../ui/tokens';
import { ChipPicker } from '../scope/ChipPicker';
import { LoadState } from '../scope/LoadState';
import { ScopeGate, type ReadyScope } from '../scope/ScopeGate';
import { ALL, ScopePicker, type ScopeValue } from '../scope/ScopePicker';
import type { Chapter } from '../scope/api';
import { useResult } from '../scope/useResult';

import {
  approveMany,
  decide,
  editQuestion,
  loadCounts,
  loadMath,
  loadQueue,
  loadSubjectContents,
  reviewReady,
  type ReviewErrorKind,
  type ReviewFilter,
} from './api';
import { MathContext } from './MathText';
import { ReviewEditor } from './ReviewEditor';
import { ReviewPane, shortId, type PaneState } from './ReviewPane';
import { useReviewKeys } from './useReviewKeys';

function errorKey(e: ReviewErrorKind): TKey {
  switch (e) {
    case 'stale':
    case 'reason':
    case 'retired':
    case 'inUse':
    case 'badConcept':
    case 'conceptRequired':
    case 'scopes':
      return `staff.review.errors.${e}`;
    case 'network':
    case 'forbidden':
      return `staff.errors.${e}`;
    default:
      return 'staff.errors.unknown';
  }
}

export function ReviewScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const ready = useResult('review-ready', reviewReady);
  const live = ready.state?.status === 'ready' ? ready.state.data : null;
  const back = (
    <Button
      title={t('staff.back')}
      icon="back"
      variant="ghost"
      size="sm"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={styles.start}
    />
  );
  if (live !== true) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        {back}
        <Header />
        <LoadState
          state={ready.state}
          title={t('staff.review.errors.loadError')}
          onRetry={ready.reload}
        />
        {live === false ? (
          <EmptyState
            icon="clipboard"
            title={t('staff.review.notReady')}
            body={t('staff.review.notReadyBody')}
          />
        ) : null}
      </ScrollView>
    );
  }
  return <ScopeGate>{(scope) => <Workspace scope={scope} back={back} />}</ScopeGate>;
}

function Header() {
  const { t } = useI18n();
  return (
    <Reveal index={0} style={styles.head}>
      <Text variant="caption" tone="primary" style={styles.kicker}>
        {t('staff.review.kicker')}
      </Text>
      <Text variant="title" accessibilityRole="header">
        {t('staff.review.title')}
      </Text>
      <Text tone="textMuted">{t('staff.review.subtitle')}</Text>
    </Reveal>
  );
}

type Verdict = { n: number; text: string; tone: 'correct' | 'weak' | 'wrong' | 'primary' };

function Workspace({ scope, back }: { scope: ReadyScope; back: ReactNode }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const { twoPane } = useLayout();

  // ---- filters --------------------------------------------------------------
  const [sel, setSel] = useState<ScopeValue>({ classId: null, subjectId: null, chapterId: ALL });
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [tab, setTab] = useState<ReviewTab>('to_review');
  const [tick, setTick] = useState(0);

  const chapterId = sel.chapterId && sel.chapterId !== ALL ? sel.chapterId : null;
  const filter: ReviewFilter | null = sel.subjectId
    ? { subjectId: sel.subjectId, chapterId, topicId, batchId, tab }
    : null;
  const fkey = filter ? JSON.stringify(filter) : null;
  const queue = useResult(fkey && `${fkey}#${tick}`, () => loadQueue(filter!));
  const counts = useResult(fkey && `c${fkey}#${tick}`, () => loadCounts(filter!));
  const chapterIds = (chapterId ? [chapterId] : chapters.map((c) => c.id)).join(',');
  const contents = useResult(chapterIds ? `s${chapterIds}` : null, () =>
    loadSubjectContents(chapterIds.split(',')),
  );
  const topics = contents.state?.status === 'ready' ? contents.state.data.topics : [];
  const concepts = contents.state?.status === 'ready' ? contents.state.data.concepts : [];
  const batches = contents.state?.status === 'ready' ? contents.state.data.batches : [];

  // ---- the working list (decided items leave without a reload) ----------------
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [showDetail, setShowDetail] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [done, setDone] = useState(0);
  const [math, setMath] = useState<ReadonlyMap<string, string>>(new Map());
  // A fresh page from the server replaces the working list (adjusting state while
  // rendering, React's pattern for "reset when an input changes").
  const page = queue.state?.status === 'ready' ? queue.state.data : null;
  const [seen, setSeen] = useState<ReviewItem[] | null>(null);
  if (page && page !== seen) {
    setSeen(page);
    setItems(page);
    setCurrentId((cur) => (cur && page.some((i) => i.id === cur) ? cur : (page[0]?.id ?? null)));
    setSelected(new Set());
  }
  // Maths for every text on this page, in one go.
  useEffect(() => {
    if (!page) return;
    const keys = new Set<string>();
    for (const it of page) {
      const v = reviewView(it);
      for (const b of [
        v.stem,
        v.explanation,
        ...v.options.map((o) => o.text),
        ...v.whyWrong.map((w) => w.text),
      ])
        for (const s of [b.en, b.ur])
          for (const p of splitMath(s)) if (p.kind === 'math') keys.add(p.key);
    }
    let alive = true;
    void loadMath([...keys]).then((m) => {
      if (alive) setMath(m);
    });
    return () => {
      alive = false;
    };
  }, [page]);
  // A new filter starts a new session count.
  const [seenFilter, setSeenFilter] = useState(fkey);
  if (fkey !== seenFilter) {
    setSeenFilter(fkey);
    setDone(0);
  }

  const current = items.find((i) => i.id === currentId) ?? null;
  const ids = useMemo(() => items.map((i) => i.id), [items]);

  // ---- per-item decision state -------------------------------------------------
  const [pane, setPane] = useState<PaneState>({
    scopes: [...DEFAULT_REVIEW_SCOPES],
    answerChecked: false,
    urduOk: false,
  });
  const [lastScopes, setLastScopes] = useState<ReviewScope[] | null>(null);
  const paneKey = current ? `${current.id}:${current.version}` : null;
  const [seenPane, setSeenPane] = useState<string | null>(null);
  if (current && paneKey !== seenPane) {
    setSeenPane(paneKey);
    setPane({
      // Keep the teacher's last choice of places while they clear a run of new drafts.
      scopes: current.scopes.length
        ? startingScopes(current)
        : (lastScopes ?? startingScopes(current)),
      answerChecked: false,
      urduOk: current.last_translation === true && !hasUrduGaps(reviewView(current)),
    });
  }

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<null | 'reject' | 'request_changes'>(null);
  const [help, setHelp] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const verdictN = useRef(0);
  useEffect(() => {
    if (!verdict) return;
    const h = setTimeout(() => setVerdict(null), 1400);
    return () => clearTimeout(h);
  }, [verdict]);

  const conceptName = (id: string | null) => {
    const c = concepts.find((x) => x.id === id);
    if (!c) return '—';
    return locale === 'ur' && c.title_ur ? c.title_ur : c.title_en;
  };

  const go = useCallback(
    (dir: 1 | -1) => {
      setDirection(dir);
      setEditing(false);
      setCurrentId((cur) => stepId(ids, cur, dir));
    },
    [ids],
  );

  const failed = (e: ReviewErrorKind) => {
    toast(t(errorKey(e)), 'warn');
    if (e === 'stale') setTick((x) => x + 1);
  };

  const applyDecision = (
    item: ReviewItem,
    decision: ReviewDecision,
    status: ReviewItem['status'],
    scopes: string[],
    notes?: string,
  ) => {
    const leaves = leavesTab(tab, decision);
    if (leaves && (tab === 'to_review' || tab === 'changes')) setDone((d) => d + 1);
    setDirection(1);
    setCurrentId(nextAfterDecision(ids, item.id, leaves));
    setItems((list) =>
      leaves
        ? list.filter((i) => i.id !== item.id)
        : list.map((i) =>
            i.id === item.id
              ? { ...i, status, scopes, last_decision: decision, last_notes: notes ?? null }
              : i,
          ),
    );
    counts.reload();
    verdictN.current += 1;
    setVerdict({
      n: verdictN.current,
      text: `${t(`staff.review.verdict.${decision}`)} · ${t('staff.review.qid', { id: shortId(item.id) })}`,
      tone: decision === 'approve' ? 'correct' : decision === 'reject' ? 'wrong' : 'weak',
    });
  };

  const approve = async () => {
    if (!current || busy) return;
    const block = approveBlock(current, pane);
    if (block) {
      toast(t(`staff.review.pane.blocked.${block}`), 'warn');
      return;
    }
    setBusy(true);
    const r = await decide(current, 'approve', { scopes: pane.scopes, translationOk: pane.urduOk });
    setBusy(false);
    if (!r.ok) return failed(r.error);
    setLastScopes(pane.scopes);
    applyDecision(current, 'approve', r.data.status, r.data.scopes);
  };

  const sendReason = async (notes: string) => {
    if (!current || !reason) return;
    setBusy(true);
    const r = await decide(current, reason, { notes, translationOk: pane.urduOk });
    setBusy(false);
    if (!r.ok) return failed(r.error);
    setReason(null);
    applyDecision(current, reason, r.data.status, r.data.scopes, notes);
  };

  const saveEdit = async (d: ReviewDraft) => {
    if (!current) return;
    const p = buildReviewPatch(current, d);
    if (!p.ok) return;
    if (!p.changed) {
      setEditing(false);
      toast(t('staff.review.editor.nothingChanged'));
      return;
    }
    setBusy(true);
    const r = await editQuestion(current, p.patch);
    setBusy(false);
    if (!r.ok) return failed(r.error);
    setEditing(false);
    const patch = p.patch;
    const edited: ReviewItem = {
      ...current,
      version: r.data.version,
      status:
        current.status === 'approved' || current.status === 'reviewed' ? 'draft' : current.status,
      origin: current.origin === 'ai' ? 'ai_edited' : current.origin,
      scopes: [],
      last_decision: null,
      last_notes: null,
      body: patch.body ?? current.body,
      answer: patch.answer ?? current.answer,
      explanation: 'explanation' in patch ? patch.explanation : current.explanation,
      cognitive_level: patch.cognitive_level ?? current.cognitive_level,
      difficulty: patch.difficulty ?? current.difficulty,
      concept_id: patch.concept_id ?? current.concept_id,
      // A newly tagged question becomes reviewable for staff; teachers keep what they had.
      can_review: current.can_review || Boolean(patch.concept_id),
    };
    const stays = tab === 'to_review' || tab === 'changes';
    setItems((list) =>
      stays
        ? list.map((i) => (i.id === current.id ? edited : i))
        : list.filter((i) => i.id !== current.id),
    );
    if (!stays) setCurrentId(nextAfterDecision(ids, current.id, true));
    counts.reload();
    verdictN.current += 1;
    setVerdict({
      n: verdictN.current,
      text: t('staff.review.verdict.edited', { v: r.data.version }),
      tone: 'primary',
    });
  };

  const bulkItems = items.filter((i) => selected.has(i.id));
  const bulkScopes = pane.scopes.length ? pane.scopes : [...DEFAULT_REVIEW_SCOPES];
  const runBulk = async () => {
    setBusy(true);
    const r = await approveMany(bulkItems, bulkScopes, null);
    setBusy(false);
    setBulkOpen(false);
    if (!r.ok) return failed(r.error);
    toast(t('staff.review.bulk.done', { n: r.data.approved }), 'success');
    if (r.data.skipped.length)
      toast(t('staff.review.bulk.skipped', { n: r.data.skipped.length }), 'warn');
    setDone((d) => d + r.data.approved);
    setTick((x) => x + 1);
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const onKey = (a: ReviewKeyAction) => {
    if (a.kind === 'help') return setHelp(true);
    if (a.kind === 'next') return go(1);
    if (a.kind === 'prev') return go(-1);
    if (!current || editing) return;
    const canDecide = current.can_review && current.status !== 'retired';
    switch (a.kind) {
      case 'approve':
        return void approve();
      case 'edit':
        return setEditing(true);
      case 'reject':
        return canDecide ? setReason('reject') : undefined;
      case 'changes':
        return canDecide ? setReason('request_changes') : undefined;
      case 'scope':
        return canDecide
          ? setPane((p) => ({ ...p, scopes: toggleScope(p.scopes, a.scope) }))
          : undefined;
      case 'checkAnswer':
        return canDecide ? setPane((p) => ({ ...p, answerChecked: !p.answerChecked })) : undefined;
      case 'checkUrdu':
        return canDecide ? setPane((p) => ({ ...p, urduOk: !p.urduOk })) : undefined;
      case 'select':
        return toggleSelect(current.id);
    }
  };
  useReviewKeys(onKey, !reason && !help && !bulkOpen);

  // ---- panes -------------------------------------------------------------------
  const c = counts.state?.status === 'ready' ? counts.state.data : null;
  const remaining = c ? c.to_review + c.changes : items.length;
  const prog = reviewProgress(done, remaining);
  const chapterTopics = topics.filter((tp) => !chapterId || tp.chapter_id === chapterId);

  const listHeader = (
    <View style={styles.listHead}>
      {back}
      <Header />
      <Reveal index={1}>
        <ScopePicker
          classes={scope.classes}
          value={sel}
          onChange={(v) => {
            setSel(v);
            setTopicId(null);
            setBatchId(null);
          }}
          chapter="filter"
          isStaff={scope.isStaff}
          onChapters={setChapters}
        />
      </Reveal>
      {chapterTopics.length > 1 ? (
        <ChipPicker
          label={t('staff.review.filters.topic')}
          chips={[
            { value: ALL, label: t('staff.review.filters.allTopics') },
            ...chapterTopics.map((tp) => ({
              value: tp.id,
              label: locale === 'ur' && tp.title_ur ? tp.title_ur : tp.title_en,
            })),
          ]}
          value={topicId ?? ALL}
          onChange={(v) => setTopicId(v === ALL ? null : v)}
        />
      ) : null}
      {batches.length ? (
        <ChipPicker
          label={t('staff.review.filters.batch')}
          chips={[
            { value: ALL, label: t('staff.review.filters.allBatches') },
            ...batches.slice(0, 8).map((b) => ({
              value: b.id,
              label: t('staff.review.filters.batchItem', {
                file: b.file_name ?? '—',
                count: b.question_count,
              }),
            })),
          ]}
          value={batchId ?? ALL}
          onChange={(v) => setBatchId(v === ALL ? null : v)}
        />
      ) : null}
      {sel.subjectId ? (
        <>
          <TabRow
            label={t('staff.review.tabs.label')}
            tabs={REVIEW_TABS.map((k) => ({
              value: k,
              label: t(`staff.review.tabs.${k}`, { n: c ? c[k] : '…' }),
            }))}
            value={tab}
            onChange={(v) => {
              setTab(v);
              setCurrentId(null);
            }}
          />
          {tab === 'to_review' || tab === 'changes' ? (
            <View style={styles.progress} accessibilityLabel={t('staff.review.progressLabel')}>
              <Meter value={prog.ratio} tone="correct" />
              <View style={styles.progressRow}>
                <Text variant="bodySm" tone="textMuted">
                  {t('staff.review.progress', { done: prog.done, left: remaining })}
                </Text>
                <Pressable onPress={() => setHelp(true)} accessibilityRole="button">
                  <Text variant="bodySm" tone="primary">
                    {t('staff.review.help.open')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {selected.size ? (
            <View style={styles.bulkBar}>
              <Text variant="label">{t('staff.review.bulk.selected', { n: selected.size })}</Text>
              <View style={styles.grow} />
              <Button
                title={t('staff.review.bulk.clear')}
                variant="ghost"
                size="sm"
                onPress={() => setSelected(new Set())}
              />
              <Button
                title={t('staff.review.bulk.approve', { n: selected.size })}
                size="sm"
                icon="check"
                onPress={() => setBulkOpen(true)}
              />
            </View>
          ) : null}
          <LoadState
            state={queue.state}
            title={t('staff.review.errors.loadError')}
            onRetry={queue.reload}
          />
        </>
      ) : null}
    </View>
  );

  const emptyList =
    queue.state?.status === 'ready' ? (
      done > 0 && tab === 'to_review' ? (
        <EmptyState
          icon="sparkles"
          title={t('staff.review.empty.allDone')}
          body={t('staff.review.empty.allDoneBody', { n: done })}
        />
      ) : (
        <EmptyState
          icon="clipboard"
          title={t(`staff.review.empty.${tab}`)}
          body={t(`staff.review.empty.${tab}Body`)}
          action={
            tab === 'to_review' ? (
              <Button
                title={t('staff.review.empty.goImport')}
                icon="upload"
                variant="secondary"
                onPress={() => router.push('/importer')}
              />
            ) : undefined
          }
        />
      )
    ) : undefined;

  const list = (
    <FlatList
      data={queue.state?.status === 'ready' ? items : []}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={emptyList}
      contentContainerStyle={styles.listContent}
      initialNumToRender={20}
      windowSize={7}
      renderItem={({ item, index }) => (
        <Row
          item={item}
          index={index}
          active={item.id === currentId}
          selected={selected.has(item.id)}
          concept={conceptName(item.concept_id)}
          onOpen={() => {
            setDirection(ids.indexOf(item.id) >= ids.indexOf(currentId ?? '') ? 1 : -1);
            setEditing(false);
            setCurrentId(item.id);
            setShowDetail(true);
          }}
          onSelect={() => toggleSelect(item.id)}
        />
      )}
    />
  );

  const detail = (
    <ScrollView contentContainerStyle={styles.detail}>
      {verdict ? <Stamp key={verdict.n} text={verdict.text} tone={verdict.tone} /> : null}
      {current ? (
        editing ? (
          <ReviewEditor
            key={`${current.id}:${current.version}`}
            item={current}
            topics={topics}
            concepts={concepts}
            saving={busy}
            onSave={(d) => void saveEdit(d)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <ReviewPane
            key={`${current.id}:${current.version}`}
            item={current}
            conceptName={conceptName(current.concept_id)}
            direction={direction}
            state={pane}
            onState={setPane}
            onApprove={() => void approve()}
            onEdit={() => setEditing(true)}
            onChanges={() => setReason('request_changes')}
            onReject={() => setReason('reject')}
            busy={busy}
            isStaff={scope.isStaff}
            onBack={twoPane ? undefined : () => setShowDetail(false)}
          />
        )
      ) : items.length ? (
        <EmptyState
          icon="eye"
          title={t('staff.review.pane.pickOne')}
          body={t('staff.review.pane.pickOneBody')}
        />
      ) : null}
    </ScrollView>
  );

  return (
    <MathContext.Provider value={math}>
      <TwoPane
        list={list}
        detail={detail}
        showDetail={showDetail && !!current}
        style={styles.two}
      />
      <ReasonSheet
        key={reason ?? 'none'}
        kind={reason}
        busy={busy}
        onClose={() => setReason(null)}
        onSend={(n) => void sendReason(n)}
      />
      <Sheet
        visible={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title={t('staff.review.bulk.title', { n: bulkItems.length })}
        footer={
          <View style={styles.sheetActions}>
            <Button
              title={t('staff.review.reason.cancel')}
              variant="ghost"
              onPress={() => setBulkOpen(false)}
            />
            <Button
              title={t('staff.review.bulk.confirm', { n: bulkItems.length })}
              icon="check"
              loading={busy}
              onPress={() => void runBulk()}
            />
          </View>
        }
      >
        <Text>
          {t('staff.review.bulk.body', {
            n: bulkItems.length,
            scopes: bulkScopes.map((s) => t(`staff.review.scope.${s}`)).join(', '),
          })}
        </Text>
      </Sheet>
      <Sheet
        visible={help}
        onClose={() => setHelp(false)}
        title={t('staff.review.help.title')}
        footer={
          <Button
            title={t('staff.review.help.close')}
            variant="secondary"
            onPress={() => setHelp(false)}
          />
        }
      >
        <View style={styles.helpRows}>
          <Text tone="textMuted">{t('staff.review.help.body')}</Text>
          {(
            [
              'nav',
              'approve',
              'edit',
              'reject',
              'changes',
              'scopes',
              'checks',
              'select',
              'save',
            ] as const
          ).map((k) => (
            <Text key={k}>{t(`staff.review.help.rows.${k}`)}</Text>
          ))}
        </View>
      </Sheet>
    </MathContext.Provider>
  );
}

/**
 * The four queue tabs as pills that wrap (a segmented control squeezes four
 * labels with counts into an unreadable strip in the 360–420 px list pane).
 */
function TabRow({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: { value: ReviewTab; label: string }[];
  value: ReviewTab;
  onChange: (v: ReviewTab) => void;
}) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.tabs}>
      {tabs.map((tb) => (
        <TabPill
          key={tb.value}
          label={tb.label}
          on={tb.value === value}
          onPress={() => onChange(tb.value)}
        />
      ))}
    </View>
  );
}

function TabPill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { colours, p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.tab,
        {
          minHeight: p.minTarget,
          borderColor: on ? colours.ink : colours.border,
          backgroundColor: on ? colours.ink : hovered ? colours.surfaceAlt : colours.surface,
        },
        ring,
      ]}
    >
      <Text variant="bodySm" tone={on ? 'onPrimary' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

/** One queue row: short id, first line of the question, concept and state words. */
function Row({
  item,
  index,
  active,
  selected,
  concept,
  onOpen,
  onSelect,
}: {
  item: ReviewItem;
  index: number;
  active: boolean;
  selected: boolean;
  concept: string;
  onOpen: () => void;
  onSelect: () => void;
}) {
  const { t, locale } = useI18n();
  const { colours, p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  // Only the first screenful cascades in; later rows are just there.
  const enter = useEnterStyle('listEnter', true, {
    translateY: index < 14 ? 10 : 0,
    delay: index < 14 ? index * 28 : 0,
  });
  // Maths reads as its TeX in the one-line list label (no $ signs).
  const label =
    splitMath(questionLabel(item.body, locale))
      .map((x) => (x.kind === 'math' ? x.tex : x.text))
      .join('') || t('staff.review.noStem');
  const v = reviewView(item);
  const id = shortId(item.id);
  return (
    <Animated.View style={enter}>
      <View
        style={[
          styles.row,
          {
            borderColor: active ? colours.primary : 'transparent',
            backgroundColor: active ? colours.primarySoft : 'transparent',
          },
        ]}
      >
        <Pressable
          onPress={onSelect}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={t('staff.review.select', { id })}
          hitSlop={8}
          style={[
            styles.box,
            {
              borderColor: selected ? colours.primary : colours.borderStrong,
              backgroundColor: selected ? colours.primary : colours.surface,
            },
          ]}
        >
          {selected ? <Icon name="check" size={14} tone="onPrimary" /> : null}
        </Pressable>
        <Pressable
          {...focusProps}
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.rowMain,
            {
              minHeight: p.minTarget,
              backgroundColor: !active && hovered ? colours.surfaceAlt : 'transparent',
            },
            ring,
          ]}
        >
          <View style={styles.rowTop}>
            <Text variant="label" tone={active ? 'onPrimarySoft' : 'textMuted'} script="latin">
              {t('staff.review.qid', { id })}
            </Text>
            <Text variant="bodySm" tone="textMuted" numberOfLines={1} style={styles.grow}>
              {concept}
            </Text>
            {item.origin !== 'human' ? <Icon name="sparkles" size={16} tone="textMuted" /> : null}
          </View>
          <Text numberOfLines={2} tone={active ? 'onPrimarySoft' : 'text'}>
            {label}
          </Text>
          <View style={styles.badges}>
            {item.status === 'approved' ? (
              <Badge
                label={
                  item.scopes.map((s) => t(`staff.review.scope.${s as ReviewScope}`)).join(' · ') ||
                  t('staff.review.verdict.approve')
                }
                tone="correct"
                icon="check"
              />
            ) : null}
            {item.last_decision === 'request_changes' && item.status !== 'approved' ? (
              <Badge label={t('staff.review.badges.changes')} tone="weak" icon="pencil" />
            ) : null}
            {hasUrduGaps(v) ? (
              <Badge label={t('staff.review.badges.needsUrdu')} tone="accent" icon="language" />
            ) : null}
            {!item.concept_id ? (
              <Badge label={t('staff.review.badges.untagged')} tone="weak" icon="warning" />
            ) : null}
            {item.concept_id && !item.can_review ? (
              <Badge label={t('staff.review.badges.readOnly')} icon="lock" />
            ) : null}
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

/** The decision lands as a stamp at the top of the pane (`reviewVerdict`), then fades away. */
function Stamp({ text, tone }: { text: string; tone: Verdict['tone'] }) {
  const { colours } = useTheme();
  const pop = useEnterStyle('reviewVerdict', true, { scaleFrom: 0.85 });
  const bg = colours[`${tone}Soft`];
  const fg = `on${tone[0]!.toUpperCase()}${tone.slice(1)}Soft` as 'onCorrectSoft';
  return (
    <Animated.View
      style={[styles.stamp, { backgroundColor: bg, borderColor: colours[tone] }, pop]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Icon
        name={tone === 'wrong' ? 'close' : tone === 'weak' ? 'pencil' : 'checkCircle'}
        size={20}
        tone={fg}
      />
      <Text variant="label" tone={fg}>
        {text}
      </Text>
    </Animated.View>
  );
}

function ReasonSheet({
  kind,
  busy,
  onClose,
  onSend,
}: {
  kind: null | 'reject' | 'request_changes';
  busy: boolean;
  onClose: () => void;
  onSend: (notes: string) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const reject = kind === 'reject';
  const send = () => {
    if (!text.trim()) {
      setError(true);
      return;
    }
    onSend(text.trim());
  };
  return (
    <Sheet
      visible={kind !== null}
      onClose={onClose}
      title={t(reject ? 'staff.review.reason.titleReject' : 'staff.review.reason.titleChanges')}
      footer={
        <View style={styles.sheetActions}>
          <Button title={t('staff.review.reason.cancel')} variant="ghost" onPress={onClose} />
          <Button
            title={t(
              reject ? 'staff.review.reason.confirmReject' : 'staff.review.reason.confirmChanges',
            )}
            variant={reject ? 'danger' : 'primary'}
            loading={busy}
            onPress={send}
          />
        </View>
      }
    >
      <View style={styles.helpRows}>
        <Text tone="textMuted">
          {t(reject ? 'staff.review.reason.bodyReject' : 'staff.review.reason.bodyChanges')}
        </Text>
        <TextField
          label={t('staff.review.reason.label')}
          placeholder={t(
            reject
              ? 'staff.review.reason.placeholderReject'
              : 'staff.review.reason.placeholderChanges',
          )}
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (v.trim()) setError(false);
          }}
          onSubmitEditing={send}
          autoFocus
          maxLength={1000}
          error={error ? t('staff.review.reason.required') : undefined}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.lg, paddingBottom: space.xl },
  start: { alignSelf: 'flex-start' },
  head: { gap: space.xs },
  kicker: { textTransform: 'uppercase', letterSpacing: 1 },
  two: { gap: space.lg },
  listHead: { gap: space.md, paddingBottom: space.sm },
  listContent: { gap: space.xxs, paddingBottom: space.xl, paddingEnd: space.sm },
  detail: { gap: space.md, paddingBottom: space.xl, paddingHorizontal: space.xs },
  progress: { gap: space.xs },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tab: {
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderWidth: strokeWidth.control,
    borderRadius: radius.full,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  bulkBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingStart: space.sm,
    borderWidth: strokeWidth.control,
    borderRadius: radius.md,
  },
  box: {
    width: 22,
    height: 22,
    marginTop: space.md,
    borderRadius: radius.sm / 2,
    borderWidth: strokeWidth.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: {
    flex: 1,
    gap: space.xxs,
    paddingVertical: space.sm,
    paddingEnd: space.sm,
    borderRadius: radius.md,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  stamp: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    borderWidth: strokeWidth.control,
  },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
  helpRows: { gap: space.sm },
  grow: { flex: 1 },
});
