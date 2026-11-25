// Curriculum editors (prompt 20). Desktop (Windows PCs, Chromebook full
// screen): chapters on the left, the chosen chapter's topics and concepts on
// the right (DESIGN_SYSTEM §5, built for TwoPane). Phone: the list, then the
// chapter. Each topic shows the mosaic its concepts make for students (one tile
// per concept), so a teacher sees what a student will fill.
import {
  chapterCounts,
  DIAGNOSTIC_DEFAULT,
  inOrder,
  localTitle,
  moveItem,
  nextSortOrder,
} from '@school/core';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  MosaicTiles,
  Reveal,
  SegmentedControl,
  SkeletonLines,
  Text,
  TwoPane,
  useLayout,
  useTheme,
  useToast,
} from '../../ui';
import { useFocusRing } from '../../ui/Sticker';
import {
  hueForSubject,
  radius,
  space,
  strokeWidth,
  subjectHues,
  type SubjectHue,
} from '../../ui/tokens';
import { useAuth } from '../auth/AuthProvider';
import type { Subject } from '../scope/api';
import { LoadState } from '../scope/LoadState';
import { ScopeGate, type ReadyScope } from '../scope/ScopeGate';
import { ScopePicker, type ScopeValue } from '../scope/ScopePicker';
import { useResult } from '../scope/useResult';
import {
  curriculumReady,
  insertChapter,
  insertConcept,
  insertTopic,
  listEditions,
  loadSubjectTree,
  reorder,
  savePrereqs,
  updateChapter,
  updateConcept,
  updateTopic,
  type ChapterRow,
  type ConceptRef,
  type ConceptRow,
  type CurriculumErrorKind,
  type SubjectTree,
  type TopicRow,
} from './api';
import { ChapterSheet, ConceptSheet, errorKey, TopicSheet, type ConceptSave } from './EditSheets';
import { EditionsPanel } from './EditionsPanel';

type Section = 'map' | 'editions';

type Editing =
  | { kind: 'chapter'; chapter: ChapterRow | null }
  | { kind: 'topic'; topic: TopicRow | null }
  | { kind: 'concept'; topicId: string; concept: ConceptRow | null };

/** Teacher/admin curriculum: chapters → topics → concepts (+ editions for admins). */
export function CurriculumScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { destination } = useAuth();
  const isAdmin = destination === 'admin';
  const [section, setSection] = useState<Section>('map');
  const ready = useResult('curriculum-ready', curriculumReady);
  const live = ready.state?.status === 'ready' ? ready.state.data : null;
  return (
    <>
      <Button
        title={t('staff.back')}
        icon="back"
        variant="ghost"
        size="sm"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={styles.start}
      />
      <Reveal index={0} style={styles.head}>
        <Text variant="caption" tone="primary" style={styles.kicker}>
          {t('staff.curriculum.kicker')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t('staff.curriculum.title')}
        </Text>
        <Text tone="textMuted">
          {t(isAdmin ? 'staff.curriculum.subtitle' : 'staff.curriculum.subtitleTeacher')}
        </Text>
      </Reveal>
      <LoadState
        state={ready.state}
        title={t('staff.curriculum.errors.loadError')}
        onRetry={ready.reload}
      />
      {live === false ? (
        <EmptyState
          icon="layers"
          title={t('staff.curriculum.notReady')}
          body={t(isAdmin ? 'staff.curriculum.notReadyAdmin' : 'staff.curriculum.notReadyTeacher')}
        />
      ) : null}
      {live && isAdmin ? (
        <Reveal index={1}>
          <SegmentedControl<Section>
            accessibilityLabel={t('staff.curriculum.tabs.label')}
            segments={[
              { value: 'map', label: t('staff.curriculum.tabs.map') },
              { value: 'editions', label: t('staff.curriculum.tabs.editions') },
            ]}
            value={section}
            onChange={setSection}
          />
        </Reveal>
      ) : null}
      {!live ? null : section === 'editions' && isAdmin ? (
        <EditionsPanel />
      ) : (
        <ScopeGate>{(scope) => <MapEditor scope={scope} />}</ScopeGate>
      )}
    </>
  );
}

// ---- The map: chapters (list) + one chapter's topics and concepts (detail) ----------------

function MapEditor({ scope }: { scope: ReadyScope }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { twoPane } = useLayout();
  const [sel, setSel] = useState<ScopeValue>({ classId: null, subjectId: null, chapterId: null });
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [pickedChapter, setChapterId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);

  const loaded = useResult(sel.subjectId ? `tree:${sel.subjectId}` : null, () =>
    loadSubjectTree(sel.subjectId!),
  );
  const editions = useResult('editions', listEditions);
  const editionList = editions.state?.status === 'ready' ? editions.state.data : [];

  // Saves patch a local copy of the loaded tree, so the screen never blinks back
  // to a skeleton. A fresh load (another subject, a reload) replaces the copy.
  const base = loaded.state?.status === 'ready' ? loaded.state.data : null;
  const [local, setLocal] = useState<{ base: SubjectTree; tree: SubjectTree } | null>(null);
  const tree = local && local.base === base ? local.tree : base;
  const setTree = (next: SubjectTree | null) =>
    setLocal(base && next ? { base, tree: next } : null);

  const onScope = useCallback((v: ScopeValue) => {
    setSel(v);
    setEditing(null);
    setShowDetail(false);
  }, []);

  const cls = scope.classes.find((c) => c.id === sel.classId) ?? null;
  const subject = subjects.find((s) => s.id === sel.subjectId) ?? null;
  const hue = hueForSubject(sel.subjectId ?? 'none');

  const chapters = useMemo(
    () => inOrder(tree?.chapters ?? []).filter((c) => showRetired || c.status === 'active'),
    [tree, showRetired],
  );
  // The picked chapter while it's on the list, else the first one.
  const chapterId = chapters.some((c) => c.id === pickedChapter)
    ? pickedChapter
    : (chapters[0]?.id ?? null);

  const counts = useMemo(
    () =>
      chapterCounts(
        (tree?.topics ?? []).map((tp) => ({
          ...tp,
          concepts: (tree?.concepts ?? []).filter((c) => c.topic_id === tp.id),
        })),
      ),
    [tree],
  );
  const chapter = chapters.find((c) => c.id === chapterId) ?? null;

  // Everything in this subject, described for the prerequisite picker.
  const subjectRefs = useMemo<ConceptRef[]>(() => {
    if (!tree) return [];
    const topics = new Map(tree.topics.map((tp) => [tp.id, tp]));
    const chs = new Map(tree.chapters.map((c) => [c.id, c]));
    return inOrder(tree.concepts).map((c) => {
      const tp = topics.get(c.topic_id);
      const ch = tp ? chs.get(tp.chapter_id) : undefined;
      return {
        id: c.id,
        title_en: c.title_en,
        title_ur: c.title_ur,
        status: c.status,
        topicTitle: tp?.title_en ?? '',
        chapterTitle: ch?.title ?? '',
        className: cls?.name ?? '',
        subjectName: subject?.name ?? '',
      };
    });
  }, [tree, cls, subject]);

  // ---- local patches ----
  const patch = (fn: (t: SubjectTree) => SubjectTree) =>
    setLocal((prev) => {
      if (!base) return prev;
      const cur = prev && prev.base === base ? prev.tree : base;
      return { base, tree: fn(cur) };
    });
  const putTopic = (row: TopicRow) =>
    patch((tr) => ({
      ...tr,
      topics: tr.topics.some((x) => x.id === row.id)
        ? tr.topics.map((x) => (x.id === row.id ? row : x))
        : [...tr.topics, row],
    }));
  const putConcept = (row: ConceptRow) =>
    patch((tr) => ({
      ...tr,
      concepts: tr.concepts.some((x) => x.id === row.id)
        ? tr.concepts.map((x) => (x.id === row.id ? row : x))
        : [...tr.concepts, row],
    }));
  const putChapter = (row: ChapterRow) =>
    patch((tr) => ({
      ...tr,
      chapters: tr.chapters.some((x) => x.id === row.id)
        ? tr.chapters.map((x) => (x.id === row.id ? row : x))
        : [...tr.chapters, row],
    }));

  const fail = (e: CurriculumErrorKind) => toast(t(errorKey(e)), 'warn');

  // ---- saves (each resolves with an error kind for the sheet, or null) ----
  const saveChapter = async (
    v: Parameters<Parameters<typeof ChapterSheet>[0]['onSave']>[0],
  ): Promise<CurriculumErrorKind | null> => {
    if (editing?.kind !== 'chapter' || !sel.subjectId) return null;
    const res = editing.chapter
      ? await updateChapter(editing.chapter.id, v)
      : await insertChapter({
          ...v,
          subject_id: sel.subjectId,
          sort_order: nextSortOrder(tree?.chapters ?? []),
        });
    if (!res.ok) return res.error;
    putChapter(res.data);
    if (!editing.chapter) {
      setChapterId(res.data.id);
      setShowDetail(true);
      toast(t('staff.curriculum.chapterAdded'), 'success');
    } else toast(t('staff.curriculum.saved'), 'success');
    setEditing(null);
    return null;
  };

  const saveTopic = async (v: {
    title_en: string;
    title_ur: string | null;
    diagnostic_size: number | null;
  }): Promise<CurriculumErrorKind | null> => {
    if (editing?.kind !== 'topic' || !chapterId) return null;
    const res = editing.topic
      ? await updateTopic(editing.topic.id, v)
      : await insertTopic({
          ...v,
          chapter_id: chapterId,
          sort_order: nextSortOrder((tree?.topics ?? []).filter((x) => x.chapter_id === chapterId)),
        });
    if (!res.ok) return res.error;
    putTopic(res.data);
    toast(t(editing.topic ? 'staff.curriculum.saved' : 'staff.curriculum.topicAdded'), 'success');
    setEditing(null);
    return null;
  };

  const saveConcept = async (v: ConceptSave): Promise<CurriculumErrorKind | null> => {
    if (editing?.kind !== 'concept') return null;
    const res = editing.concept
      ? await updateConcept(editing.concept.id, v.fields)
      : await insertConcept({
          ...v.fields,
          topic_id: editing.topicId,
          sort_order: nextSortOrder(
            (tree?.concepts ?? []).filter((x) => x.topic_id === editing.topicId),
          ),
        });
    if (!res.ok) return res.error;
    putConcept(res.data);
    // A new concept is saved before its links (they need its id); if the links
    // fail, the sheet reopens as an edit of the saved concept with the reason.
    if (v.add.length || v.remove.length) {
      const pr = await savePrereqs(res.data.id, v.add, v.remove);
      if (!pr.ok) {
        setEditing({ kind: 'concept', topicId: editing.topicId, concept: res.data });
        return pr.error;
      }
      patch((tr) => ({
        ...tr,
        prereqs: [
          ...tr.prereqs.filter(
            (e) => !(e.concept_id === res.data.id && v.remove.includes(e.requires_concept_id)),
          ),
          ...v.add.map((r) => ({ concept_id: res.data.id, requires_concept_id: r })),
        ],
      }));
      // Outside concepts picked from earlier classes need their description for the chips.
      if (v.add.some((id) => !tree?.concepts.some((c) => c.id === id))) loaded.reload();
    }
    toast(
      t(editing.concept ? 'staff.curriculum.saved' : 'staff.curriculum.conceptAdded'),
      'success',
    );
    setEditing(null);
    return null;
  };

  const setTopicStatus = async (tp: TopicRow, status: 'active' | 'retired') => {
    const res = await updateTopic(tp.id, { status });
    if (!res.ok) return fail(res.error);
    putTopic(res.data);
    toast(
      t(status === 'retired' ? 'staff.curriculum.retiredToast' : 'staff.curriculum.restoredToast'),
      'success',
    );
  };
  const setConceptStatus = async (c: ConceptRow, status: 'active' | 'retired') => {
    const res = await updateConcept(c.id, { status });
    if (!res.ok) return fail(res.error);
    putConcept(res.data);
    toast(
      t(status === 'retired' ? 'staff.curriculum.retiredToast' : 'staff.curriculum.restoredToast'),
      'success',
    );
  };
  const setChapterStatus = async (c: ChapterRow, status: 'active' | 'retired') => {
    const res = await updateChapter(c.id, { status });
    if (!res.ok) return fail(res.error);
    putChapter(res.data);
    toast(
      t(status === 'retired' ? 'staff.curriculum.retiredToast' : 'staff.curriculum.restoredToast'),
      'success',
    );
  };

  const move = async (
    table: 'topics' | 'concepts',
    siblings: { id: string; sort_order: number }[],
    id: string,
    dir: -1 | 1,
  ) => {
    const changes = moveItem(siblings, id, dir);
    if (!changes.length) return;
    const order = new Map(changes.map((c) => [c.id, c.sort_order]));
    // Optimistic: reorder now, put it back if the server refuses.
    const before = tree;
    patch((tr) =>
      table === 'topics'
        ? {
            ...tr,
            topics: tr.topics.map((x) =>
              order.has(x.id) ? { ...x, sort_order: order.get(x.id)! } : x,
            ),
          }
        : {
            ...tr,
            concepts: tr.concepts.map((x) =>
              order.has(x.id) ? { ...x, sort_order: order.get(x.id)! } : x,
            ),
          },
    );
    const res = await reorder(table, changes);
    if (!res.ok) {
      setTree(before);
      fail(res.error);
    }
  };

  // ---- list pane ----
  const list = (
    <View style={styles.pane}>
      <ScopePicker
        classes={scope.classes}
        value={sel}
        onChange={onScope}
        chapter="none"
        isStaff={scope.isStaff}
        onSubjects={setSubjects}
      />
      {sel.subjectId ? (
        <>
          <View style={styles.listHead}>
            <Text variant="heading" accessibilityRole="header">
              {t('staff.curriculum.chapters')}
            </Text>
            <RetiredToggle value={showRetired} onChange={setShowRetired} />
          </View>
          <LoadState
            state={loaded.state}
            title={t('staff.curriculum.errors.loadError')}
            onRetry={loaded.reload}
          />
          {tree && chapters.length === 0 ? (
            <EmptyState
              icon="book"
              title={t('staff.curriculum.noChapters')}
              body={t(
                scope.isStaff
                  ? 'staff.curriculum.noChaptersAdmin'
                  : 'staff.curriculum.noChaptersTeacher',
              )}
              action={
                scope.isStaff ? (
                  <Button
                    title={t('staff.curriculum.addChapter')}
                    icon="plus"
                    onPress={() => setEditing({ kind: 'chapter', chapter: null })}
                  />
                ) : undefined
              }
            />
          ) : null}
          {tree ? (
            <View style={styles.chapterList} accessibilityRole="list">
              {chapters.map((c, i) => {
                const n = counts.get(c.id);
                const ed = editionList.find((e) => e.id === c.curriculum_id);
                return (
                  <Reveal key={c.id} index={i + 2}>
                    <ChapterItem
                      number={i + 1}
                      hue={hue}
                      title={localTitle(c, locale)}
                      meta={
                        n
                          ? t('staff.curriculum.chapterMeta', {
                              topics: n.topics,
                              concepts: n.concepts,
                            })
                          : t('staff.curriculum.chapterMetaEmpty')
                      }
                      edition={ed?.code ?? null}
                      showNoEdition={scope.isStaff}
                      retired={c.status === 'retired'}
                      selected={twoPane && c.id === chapterId}
                      onPress={() => {
                        setChapterId(c.id);
                        setShowDetail(true);
                      }}
                    />
                  </Reveal>
                );
              })}
            </View>
          ) : null}
          {tree && chapters.length > 0 && scope.isStaff ? (
            <Button
              title={t('staff.curriculum.addChapter')}
              icon="plus"
              variant="secondary"
              size="sm"
              onPress={() => setEditing({ kind: 'chapter', chapter: null })}
              style={styles.start}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );

  // ---- detail pane ----
  let detail: React.ReactNode = twoPane ? (
    tree && chapters.length ? (
      <EmptyState
        icon="layers"
        title={t('staff.curriculum.pickChapter')}
        body={t('staff.curriculum.pickChapterBody')}
      />
    ) : loaded.state?.status === 'loading' ? (
      <View style={styles.pane}>
        <SkeletonLines lines={6} />
      </View>
    ) : null
  ) : null;

  if (tree && chapter) {
    const chapterNo = chapters.findIndex((c) => c.id === chapter.id) + 1;
    const allTopics = inOrder(tree.topics.filter((x) => x.chapter_id === chapter.id));
    const topics = allTopics.filter((x) => showRetired || x.status === 'active');
    const ed = editionList.find((e) => e.id === chapter.curriculum_id);
    detail = (
      <View style={styles.pane}>
        {twoPane ? null : (
          <Button
            title={t('staff.curriculum.chapters')}
            icon="back"
            variant="ghost"
            size="sm"
            onPress={() => setShowDetail(false)}
            style={styles.start}
          />
        )}
        <ChapterHeader
          key={chapter.id}
          hue={hue}
          kicker={t('staff.curriculum.chapterHeader', { n: chapterNo })}
          title={chapter.title}
          titleUr={chapter.title_ur}
          textbookRef={chapter.textbook_ref}
          edition={ed ? `${ed.code} · ${ed.name}` : null}
          retired={chapter.status === 'retired'}
          admin={scope.isStaff}
          onEdit={() => setEditing({ kind: 'chapter', chapter })}
          onRetire={() =>
            setChapterStatus(chapter, chapter.status === 'retired' ? 'active' : 'retired')
          }
        />
        <View style={styles.listHead}>
          <Text variant="heading" accessibilityRole="header">
            {t('staff.curriculum.topics')}
          </Text>
          {topics.length ? (
            <Button
              title={t('staff.curriculum.addTopic')}
              icon="plus"
              size="sm"
              onPress={() => setEditing({ kind: 'topic', topic: null })}
            />
          ) : null}
        </View>
        {topics.length === 0 ? (
          <EmptyState
            icon="layers"
            title={t('staff.curriculum.noTopics')}
            body={t('staff.curriculum.noTopicsBody')}
            action={
              <Button
                title={t('staff.curriculum.addTopic')}
                icon="plus"
                onPress={() => setEditing({ kind: 'topic', topic: null })}
              />
            }
          />
        ) : null}
        {topics.map((tp, i) => {
          const all = inOrder(tree.concepts.filter((c) => c.topic_id === tp.id));
          const visible = all.filter((c) => showRetired || c.status === 'active');
          return (
            <Reveal key={tp.id} index={i + 1}>
              <TopicCard
                topic={tp}
                number={i + 1}
                hue={hue}
                concepts={visible}
                activeConcepts={all.filter((c) => c.status === 'active').length}
                prereqs={tree.prereqs}
                describe={(id) =>
                  subjectRefs.find((r) => r.id === id) ?? tree.outside.get(id) ?? null
                }
                first={i === 0}
                last={i === topics.length - 1}
                onEdit={() => setEditing({ kind: 'topic', topic: tp })}
                onRetire={() => setTopicStatus(tp, tp.status === 'retired' ? 'active' : 'retired')}
                onMove={(dir) => move('topics', allTopics, tp.id, dir)}
                onAddConcept={() => setEditing({ kind: 'concept', topicId: tp.id, concept: null })}
                onEditConcept={(c) => setEditing({ kind: 'concept', topicId: tp.id, concept: c })}
                onRetireConcept={(c) =>
                  setConceptStatus(c, c.status === 'retired' ? 'active' : 'retired')
                }
                onMoveConcept={(c, dir) => move('concepts', all, c.id, dir)}
              />
            </Reveal>
          );
        })}
      </View>
    );
  }

  return (
    <>
      <TwoPane list={list} detail={detail} showDetail={showDetail} style={styles.two} />
      {editing?.kind === 'chapter' ? (
        <ChapterSheet
          chapter={editing.chapter}
          editions={editionList}
          onClose={() => setEditing(null)}
          onSave={saveChapter}
        />
      ) : null}
      {editing?.kind === 'topic' ? (
        <TopicSheet topic={editing.topic} onClose={() => setEditing(null)} onSave={saveTopic} />
      ) : null}
      {editing?.kind === 'concept' && tree ? (
        <ConceptSheet
          key={editing.concept?.id ?? 'new'}
          concept={editing.concept}
          subjectConcepts={subjectRefs}
          edges={tree.prereqs}
          current={
            editing.concept
              ? tree.prereqs
                  .filter((e) => e.concept_id === editing.concept!.id)
                  .map((e) => e.requires_concept_id)
              : []
          }
          known={tree.outside}
          subjectName={subject?.name ?? ''}
          gradeLevel={cls?.grade_level ?? 0}
          onClose={() => setEditing(null)}
          onSave={saveConcept}
        />
      ) : null}
    </>
  );
}

// ---- Pieces ---------------------------------------------------------------------------

function RetiredToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { t } = useI18n();
  return (
    <Button
      title={t('staff.curriculum.showRetired')}
      icon={value ? 'eye' : 'eyeOff'}
      variant="ghost"
      size="sm"
      accessibilityHint={t('staff.curriculum.retireTopicHint')}
      onPress={() => onChange(!value)}
    />
  );
}

/** A numbered tile in the subject's hue (ink text: the hues are light fills). */
function NumberTile({ hue, label, size = 36 }: { hue: SubjectHue; label: string; size?: number }) {
  const { colours, scheme } = useTheme();
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          backgroundColor: subjectHues[hue][scheme],
          borderColor: scheme === 'dark' ? colours.borderStrong : colours.ink,
        },
      ]}
    >
      <Text variant="label" style={{ color: colours.ink }}>
        {label}
      </Text>
    </View>
  );
}

function ChapterItem({
  number,
  hue,
  title,
  meta,
  edition,
  showNoEdition,
  retired,
  selected,
  onPress,
}: {
  number: number;
  hue: SubjectHue;
  title: string;
  meta: string;
  edition: string | null;
  showNoEdition: boolean;
  retired: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const { colours, p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${meta}`}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.chapter,
        {
          minHeight: p.minTarget + 12,
          borderColor: selected ? colours.primary : colours.border,
          backgroundColor: selected
            ? colours.primarySoft
            : pressed || hovered
              ? colours.surfaceAlt
              : colours.surface,
          opacity: retired ? 0.7 : 1,
        },
        ring,
      ]}
    >
      <NumberTile hue={hue} label={String(number)} />
      <View style={styles.flex}>
        <Text variant="label" tone={selected ? 'onPrimarySoft' : 'text'}>
          {title}
        </Text>
        <Text variant="bodySm" tone={selected ? 'onPrimarySoft' : 'textMuted'}>
          {meta}
        </Text>
      </View>
      {retired ? (
        <Badge label={t('staff.curriculum.retired')} icon="archive" />
      ) : edition ? (
        <Badge label={edition} tone="primary" />
      ) : showNoEdition ? (
        <Badge label={t('staff.curriculum.noEdition')} tone="weak" icon="warning" />
      ) : null}
    </Pressable>
  );
}

function ChapterHeader({
  hue,
  kicker,
  title,
  titleUr,
  textbookRef,
  edition,
  retired,
  admin,
  onEdit,
  onRetire,
}: {
  hue: SubjectHue;
  kicker: string;
  title: string;
  titleUr: string | null;
  textbookRef: string | null;
  edition: string | null;
  retired: boolean;
  admin: boolean;
  onEdit: () => void;
  onRetire: () => void;
}) {
  const { t } = useI18n();
  const { colours, scheme } = useTheme();
  return (
    <Reveal index={0}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colours.surface,
            borderColor: colours.border,
            borderTopColor: subjectHues[hue][scheme],
          },
        ]}
      >
        <Text variant="caption" tone="textMuted" style={styles.kicker}>
          {kicker}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {titleUr ? (
          <Text variant="heading" style={styles.urdu}>
            {titleUr}
          </Text>
        ) : null}
        <View style={styles.badges}>
          {edition ? <Badge label={edition} tone="primary" icon="book" /> : null}
          {textbookRef ? (
            <Badge label={t('staff.curriculum.textbookRef', { ref: textbookRef })} />
          ) : null}
          {retired ? <Badge label={t('staff.curriculum.retired')} icon="archive" /> : null}
        </View>
        {admin ? (
          <View style={styles.actions}>
            <Button
              title={t('staff.curriculum.editChapter')}
              icon="pencil"
              variant="secondary"
              size="sm"
              onPress={onEdit}
            />
            <Button
              title={t(retired ? 'staff.curriculum.restore' : 'staff.curriculum.retire')}
              icon={retired ? 'restore' : 'archive'}
              variant="ghost"
              size="sm"
              accessibilityHint={t('staff.curriculum.retireTopicHint')}
              onPress={onRetire}
            />
          </View>
        ) : null}
      </View>
    </Reveal>
  );
}

function TopicCard({
  topic,
  number,
  hue,
  concepts,
  activeConcepts,
  prereqs,
  describe,
  first,
  last,
  onEdit,
  onRetire,
  onMove,
  onAddConcept,
  onEditConcept,
  onRetireConcept,
  onMoveConcept,
}: {
  topic: TopicRow;
  number: number;
  hue: SubjectHue;
  concepts: ConceptRow[];
  activeConcepts: number;
  prereqs: { concept_id: string; requires_concept_id: string }[];
  describe: (id: string) => { title_en: string; title_ur: string | null } | null;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onRetire: () => void;
  onMove: (dir: -1 | 1) => void;
  onAddConcept: () => void;
  onEditConcept: (c: ConceptRow) => void;
  onRetireConcept: (c: ConceptRow) => void;
  onMoveConcept: (c: ConceptRow, dir: -1 | 1) => void;
}) {
  const { t, locale } = useI18n();
  const { colours } = useTheme();
  const retired = topic.status === 'retired';
  const name = localTitle(topic, locale);
  return (
    <View
      style={[
        styles.topic,
        {
          backgroundColor: colours.surface,
          borderColor: colours.border,
          opacity: retired ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.topicHead}>
        <NumberTile hue={hue} label={String(number)} size={40} />
        <View style={styles.flex}>
          <Text variant="caption" tone="textMuted" style={styles.kicker}>
            {t('staff.curriculum.topicNumber', { n: number })}
          </Text>
          <Text variant="heading" accessibilityRole="header">
            {topic.title_en}
          </Text>
          {topic.title_ur ? <Text style={styles.urdu}>{topic.title_ur}</Text> : null}
        </View>
        <View style={styles.iconRow}>
          <IconButton
            icon="arrowUp"
            label={t('staff.curriculum.moveUp', { name })}
            disabled={first}
            onPress={() => onMove(-1)}
          />
          <IconButton
            icon="arrowDown"
            label={t('staff.curriculum.moveDown', { name })}
            disabled={last}
            onPress={() => onMove(1)}
          />
          <IconButton icon="pencil" label={t('staff.curriculum.editTopic')} onPress={onEdit} />
          <IconButton
            icon={retired ? 'restore' : 'archive'}
            label={`${t(retired ? 'staff.curriculum.restore' : 'staff.curriculum.retire')}: ${name}`}
            onPress={onRetire}
          />
        </View>
      </View>

      <View style={styles.badges}>
        <Badge
          icon="tasks"
          tone={topic.diagnostic_size ? 'accent' : 'neutral'}
          label={
            topic.diagnostic_size
              ? t('staff.curriculum.diagnostic', { n: topic.diagnostic_size })
              : t('staff.curriculum.diagnosticDefault', { n: DIAGNOSTIC_DEFAULT })
          }
        />
        {retired ? <Badge label={t('staff.curriculum.retired')} icon="archive" /> : null}
      </View>
      {activeConcepts > 0 ? (
        <MosaicTiles
          total={activeConcepts}
          mastered={activeConcepts}
          hue={hue}
          label={t('staff.curriculum.tilesLabel', { count: activeConcepts })}
        />
      ) : null}

      <View style={[styles.concepts, { borderTopColor: colours.border }]}>
        <Text variant="label" tone="textMuted">
          {t('staff.curriculum.concepts')}
        </Text>
        {concepts.length === 0 ? (
          <Text tone="textMuted" variant="bodySm">
            {t('staff.curriculum.noConcepts')}
          </Text>
        ) : null}
        {concepts.map((c, i) => (
          <ConceptLine
            key={c.id}
            concept={c}
            label={`${number}.${i + 1}`}
            hue={hue}
            needs={prereqs
              .filter((e) => e.concept_id === c.id)
              .map((e) => describe(e.requires_concept_id))
              .filter((x): x is { title_en: string; title_ur: string | null } => x !== null)
              .map((x) => localTitle(x, locale))}
            first={i === 0}
            last={i === concepts.length - 1}
            onEdit={() => onEditConcept(c)}
            onRetire={() => onRetireConcept(c)}
            onMove={(dir) => onMoveConcept(c, dir)}
          />
        ))}
        <Button
          title={t('staff.curriculum.addConcept')}
          icon="plus"
          variant="ghost"
          size="sm"
          onPress={onAddConcept}
          style={styles.start}
        />
      </View>
    </View>
  );
}

function ConceptLine({
  concept,
  label,
  hue,
  needs,
  first,
  last,
  onEdit,
  onRetire,
  onMove,
}: {
  concept: ConceptRow;
  label: string;
  hue: SubjectHue;
  needs: string[];
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onRetire: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { t, locale } = useI18n();
  const { colours } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const retired = concept.status === 'retired';
  const name = localTitle(concept, locale);
  return (
    <View style={[styles.conceptRow, { opacity: retired ? 0.7 : 1 }]}>
      <Pressable
        {...focusProps}
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${name}`}
        accessibilityHint={t('staff.curriculum.editConcept')}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          styles.conceptMain,
          { backgroundColor: pressed || hovered ? colours.surfaceAlt : 'transparent' },
          ring,
        ]}
      >
        <NumberTile hue={hue} label={label} size={32} />
        <View style={styles.flex}>
          <Text>{concept.title_en}</Text>
          {concept.title_ur ? (
            <Text variant="bodySm" tone="textMuted" style={styles.urdu}>
              {concept.title_ur}
            </Text>
          ) : null}
          {needs.length || retired ? (
            <View style={styles.badges}>
              {needs.length ? (
                <Badge icon="link" label={`${t('staff.curriculum.needs')}: ${needs.join(', ')}`} />
              ) : null}
              {retired ? <Badge label={t('staff.curriculum.retired')} icon="archive" /> : null}
            </View>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.iconRow}>
        <IconButton
          icon="arrowUp"
          label={t('staff.curriculum.moveUp', { name })}
          disabled={first}
          onPress={() => onMove(-1)}
        />
        <IconButton
          icon="arrowDown"
          label={t('staff.curriculum.moveDown', { name })}
          disabled={last}
          onPress={() => onMove(1)}
        />
        <IconButton
          icon={retired ? 'restore' : 'archive'}
          label={`${t(retired ? 'staff.curriculum.restore' : 'staff.curriculum.retire')}: ${name}`}
          onPress={onRetire}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: space.xxs },
  start: { alignSelf: 'flex-start' },
  head: { gap: space.xs },
  kicker: { fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  two: { gap: space.lg },
  pane: { gap: space.md, paddingHorizontal: space.xs, paddingBottom: space.lg },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chapterList: { gap: space.sm },
  chapter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderWidth: strokeWidth.control,
    borderRadius: radius.md,
  },
  tile: {
    borderRadius: radius.sm,
    borderWidth: strokeWidth.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    padding: space.lg,
    gap: space.xs,
    borderWidth: 1,
    borderTopWidth: 10,
    borderRadius: radius.md,
  },
  // Urdu under the English title, written right to left but kept with its title.
  urdu: { writingDirection: 'rtl', alignSelf: 'flex-start' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  topic: { padding: space.lg, gap: space.md, borderWidth: 1, borderRadius: radius.md },
  topicHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, flexWrap: 'wrap' },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  concepts: { gap: space.xs, borderTopWidth: 1, paddingTop: space.md },
  conceptRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  conceptMain: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.xs,
    borderRadius: radius.sm,
  },
});
