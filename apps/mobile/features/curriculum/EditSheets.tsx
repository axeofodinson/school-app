// The curriculum editors' forms, each in a Sheet (bottom sheet on phones, a
// centred dialog on Chromebooks/Windows). Enter saves from a one-line field,
// Ctrl+Enter from anywhere, Esc closes. Rules come from @school/core
// (buildTopic, buildConcept, ...); the database checks them again.
import {
  buildChapter,
  buildConcept,
  buildEdition,
  buildTopic,
  DIAGNOSTIC_DEFAULT,
  DIAGNOSTIC_MAX,
  DIAGNOSTIC_MIN,
  prereqChanges,
  wouldCreateCycle,
  type CurriculumError,
  type PrereqEdge,
} from '@school/core';
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import {
  Badge,
  Button,
  SegmentedControl,
  Sheet,
  SkeletonLines,
  Text,
  TextField,
  useTheme,
} from '../../ui';
import { radius, space } from '../../ui/tokens';
import { ChipPicker } from '../scope/ChipPicker';
import { ERROR_KEYS } from '../scope/LoadState';
import { useResult } from '../scope/useResult';
import { useSaveShortcut } from '../scope/useSaveShortcut';
import {
  listEarlierConcepts,
  type ChapterRow,
  type ConceptRef,
  type ConceptRow,
  type CurriculumErrorKind,
  type Edition,
  type TopicRow,
} from './api';
import { CheckRow } from './CheckRow';

export function errorKey(e: CurriculumError | CurriculumErrorKind): TKey {
  switch (e) {
    case 'network':
    case 'forbidden':
    case 'notConfigured':
    case 'unknown':
      return ERROR_KEYS[e];
    default:
      return `staff.curriculum.errors.${e}` as TKey;
  }
}

/** Sheet + Save/Cancel footer + the save shortcut. */
function FormSheet({
  title,
  onClose,
  onSave,
  saving,
  error,
  children,
  extraFooter,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
  children: ReactNode;
  extraFooter?: ReactNode;
}) {
  const { t } = useI18n();
  useSaveShortcut(onSave, !saving);
  return (
    <Sheet
      visible
      title={title}
      onClose={onClose}
      footer={
        <>
          {error ? (
            <Text tone="onWrongSoft" accessibilityLiveRegion="polite" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <View style={styles.footer}>
            {extraFooter}
            <View style={styles.flex} />
            <Button
              title={t('staff.curriculum.cancel')}
              variant="ghost"
              onPress={onClose}
              disabled={saving}
            />
            <Button
              title={t('staff.curriculum.save')}
              icon="check"
              onPress={onSave}
              loading={saving}
            />
          </View>
        </>
      }
    >
      {children}
    </Sheet>
  );
}

type FieldErrors = Partial<Record<string, string>>;
function useFormError() {
  const { t } = useI18n();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  return {
    fieldErrors,
    error,
    clear: () => {
      setFieldErrors({});
      setError(null);
    },
    field: (field: string, e: CurriculumError | CurriculumErrorKind) =>
      setFieldErrors({ [field]: t(errorKey(e)) }),
    server: (e: CurriculumErrorKind) => setError(t(errorKey(e))),
  };
}

// ---- Topic ---------------------------------------------------------------------------

export function TopicSheet({
  topic,
  onClose,
  onSave,
}: {
  topic: TopicRow | null;
  onClose: () => void;
  /** Resolves with an error kind, or null when saved (the sheet then closes). */
  onSave: (v: {
    title_en: string;
    title_ur: string | null;
    diagnostic_size: number | null;
  }) => Promise<CurriculumErrorKind | null>;
}) {
  const { t } = useI18n();
  const [titleEn, setTitleEn] = useState(topic?.title_en ?? '');
  const [titleUr, setTitleUr] = useState(topic?.title_ur ?? '');
  const [size, setSize] = useState(topic?.diagnostic_size ? String(topic.diagnostic_size) : '');
  const [saving, setSaving] = useState(false);
  const f = useFormError();

  const save = async () => {
    if (saving) return;
    f.clear();
    const built = buildTopic({ titleEn, titleUr, diagnosticSize: size });
    if (!built.ok) return f.field(built.field, built.error);
    setSaving(true);
    const err = await onSave(built.value);
    setSaving(false);
    if (err) f.server(err);
  };

  return (
    <FormSheet
      title={t(topic ? 'staff.curriculum.editTopic' : 'staff.curriculum.addTopic')}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={f.error}
    >
      <TextField
        label={t('staff.curriculum.fields.titleEn')}
        value={titleEn}
        onChangeText={setTitleEn}
        error={f.fieldErrors.titleEn}
        script="latin"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
        maxLength={200}
      />
      <TextField
        label={t('staff.curriculum.fields.titleUr')}
        helper={t('staff.curriculum.fields.titleUrHelper')}
        value={titleUr}
        onChangeText={setTitleUr}
        error={f.fieldErrors.titleUr}
        script="urdu"
        onSubmitEditing={save}
        maxLength={200}
      />
      <TextField
        label={t('staff.curriculum.fields.diagnostic')}
        helper={t('staff.curriculum.fields.diagnosticHelper', {
          min: DIAGNOSTIC_MIN,
          max: DIAGNOSTIC_MAX,
          def: DIAGNOSTIC_DEFAULT,
        })}
        value={size}
        onChangeText={setSize}
        error={f.fieldErrors.diagnosticSize}
        script="latin"
        keyboardType="number-pad"
        inputMode="numeric"
        onSubmitEditing={save}
        maxLength={3}
        style={styles.narrow}
      />
    </FormSheet>
  );
}

// ---- Concept + prerequisites ---------------------------------------------------------

export interface ConceptSave {
  fields: {
    title_en: string;
    title_ur: string | null;
    summary_en: string | null;
    summary_ur: string | null;
  };
  add: string[];
  remove: string[];
}

type PickFrom = 'subject' | 'earlier';

export function ConceptSheet({
  concept,
  subjectConcepts,
  edges,
  current,
  known,
  subjectName,
  gradeLevel,
  onClose,
  onSave,
}: {
  concept: ConceptRow | null;
  /** Every concept of this subject, for the picker (already described). */
  subjectConcepts: ConceptRef[];
  /** All prerequisite links known on screen (for the loop check). */
  edges: PrereqEdge[];
  /** This concept's current prerequisites. */
  current: string[];
  /** Descriptions of concepts already linked from outside the subject. */
  known: Map<string, ConceptRef>;
  subjectName: string;
  gradeLevel: number;
  onClose: () => void;
  onSave: (v: ConceptSave) => Promise<CurriculumErrorKind | null>;
}) {
  const { t, locale } = useI18n();
  const { colours } = useTheme();
  const [titleEn, setTitleEn] = useState(concept?.title_en ?? '');
  const [titleUr, setTitleUr] = useState(concept?.title_ur ?? '');
  const [summaryEn, setSummaryEn] = useState(concept?.summary_en ?? '');
  const [summaryUr, setSummaryUr] = useState(concept?.summary_ur ?? '');
  const [picked, setPicked] = useState<string[]>(current);
  const [from, setFrom] = useState<PickFrom>('subject');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const f = useFormError();

  const earlier = useResult(
    from === 'earlier' ? `earlier:${subjectName}:${gradeLevel}` : null,
    () => listEarlierConcepts(subjectName, gradeLevel),
  );
  const earlierList = earlier.state?.status === 'ready' ? earlier.state.data : null;

  const describe = (id: string): ConceptRef | undefined =>
    subjectConcepts.find((c) => c.id === id) ??
    known.get(id) ??
    earlierList?.find((c) => c.id === id);
  const title = (c: { title_en: string; title_ur: string | null }) =>
    locale === 'ur' && c.title_ur ? c.title_ur : c.title_en;

  const options = useMemo(() => {
    const base = from === 'subject' ? subjectConcepts : (earlierList ?? []);
    const q = query.trim().toLowerCase();
    return base
      .filter((c) => c.id !== concept?.id && (c.status === 'active' || picked.includes(c.id)))
      .filter(
        (c) =>
          !q ||
          c.title_en.toLowerCase().includes(q) ||
          (c.title_ur ?? '').includes(query.trim()) ||
          c.topicTitle.toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [from, subjectConcepts, earlierList, query, concept?.id, picked]);

  // Loop check against the links on screen, minus this concept's own (they are being edited).
  const otherEdges = useMemo(
    () => edges.filter((e) => !concept || e.concept_id !== concept.id),
    [edges, concept],
  );
  const loops = (id: string) => (concept ? wouldCreateCycle(otherEdges, concept.id, id) : false);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = async () => {
    if (saving) return;
    f.clear();
    const built = buildConcept({ titleEn, titleUr, summaryEn, summaryUr });
    if (!built.ok) return f.field(built.field, built.error);
    setSaving(true);
    const err = await onSave({ fields: built.value, ...prereqChanges(current, picked) });
    setSaving(false);
    if (err) f.server(err);
  };

  return (
    <FormSheet
      title={t(concept ? 'staff.curriculum.editConcept' : 'staff.curriculum.addConcept')}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={f.error}
    >
      <TextField
        label={t('staff.curriculum.fields.titleEn')}
        value={titleEn}
        onChangeText={setTitleEn}
        error={f.fieldErrors.titleEn}
        script="latin"
        autoFocus
        onSubmitEditing={save}
        maxLength={200}
      />
      <TextField
        label={t('staff.curriculum.fields.titleUr')}
        helper={t('staff.curriculum.fields.titleUrHelper')}
        value={titleUr}
        onChangeText={setTitleUr}
        error={f.fieldErrors.titleUr}
        script="urdu"
        onSubmitEditing={save}
        maxLength={200}
      />
      <TextField
        label={t('staff.curriculum.fields.summaryEn')}
        helper={t('staff.curriculum.fields.summaryHelper')}
        value={summaryEn}
        onChangeText={setSummaryEn}
        error={f.fieldErrors.summaryEn}
        script="latin"
        multiline
        numberOfLines={3}
        maxLength={1000}
      />
      <TextField
        label={t('staff.curriculum.fields.summaryUr')}
        value={summaryUr}
        onChangeText={setSummaryUr}
        error={f.fieldErrors.summaryUr}
        script="urdu"
        multiline
        numberOfLines={3}
        maxLength={1000}
      />

      <View style={[styles.section, { borderColor: colours.border }]}>
        <View style={styles.sectionHead}>
          <Text variant="heading" accessibilityRole="header">
            {t('staff.curriculum.prereqs.title')}
          </Text>
          {picked.length ? (
            <Badge
              label={t('staff.curriculum.prereqs.selected', { count: picked.length })}
              tone="primary"
              icon="link"
            />
          ) : null}
        </View>
        <Text variant="bodySm" tone="textMuted">
          {t('staff.curriculum.prereqs.help')}
        </Text>
        {picked.length ? (
          <View style={styles.chips}>
            {picked.map((id) => {
              const c = describe(id);
              return <Badge key={id} label={c ? title(c) : '…'} tone="neutral" icon="link" />;
            })}
          </View>
        ) : null}
        <SegmentedControl<PickFrom>
          accessibilityLabel={t('staff.curriculum.prereqs.title')}
          segments={[
            { value: 'subject', label: t('staff.curriculum.prereqs.thisSubject') },
            { value: 'earlier', label: t('staff.curriculum.prereqs.earlier') },
          ]}
          value={from}
          onChange={setFrom}
        />
        <TextField
          label={t('staff.curriculum.prereqs.search')}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        {from === 'earlier' && !earlierList ? (
          earlier.state?.status === 'error' ? (
            <Text tone="onWrongSoft">{t(errorKey(earlier.state.error))}</Text>
          ) : (
            <SkeletonLines lines={3} />
          )
        ) : null}
        {(from === 'subject' || earlierList) && options.length === 0 ? (
          <Text tone="textMuted">
            {from === 'earlier' && !query.trim()
              ? t('staff.curriculum.prereqs.noneEarlier', { subject: subjectName })
              : t('staff.curriculum.prereqs.noneFound')}
          </Text>
        ) : null}
        <View accessibilityRole="list" style={styles.options}>
          {options.map((c) => {
            const checked = picked.includes(c.id);
            const loop = !checked && loops(c.id);
            return (
              <CheckRow
                key={c.id}
                label={title(c)}
                detail={t('staff.curriculum.prereqs.where', {
                  class: c.className,
                  chapter: c.chapterTitle,
                  topic: c.topicTitle,
                })}
                checked={checked}
                disabled={loop}
                note={t('staff.curriculum.prereqs.loop')}
                onToggle={() => toggle(c.id)}
              />
            );
          })}
        </View>
      </View>
    </FormSheet>
  );
}

// ---- Chapter (admin) -----------------------------------------------------------------

export function ChapterSheet({
  chapter,
  editions,
  onClose,
  onSave,
}: {
  chapter: ChapterRow | null;
  editions: Edition[];
  onClose: () => void;
  onSave: (v: {
    title: string;
    title_ur: string | null;
    textbook_ref: string | null;
    curriculum_id: string | null;
  }) => Promise<CurriculumErrorKind | null>;
}) {
  const { t } = useI18n();
  const NONE = '__none';
  const [titleEn, setTitleEn] = useState(chapter?.title ?? '');
  const [titleUr, setTitleUr] = useState(chapter?.title_ur ?? '');
  const [ref, setRef] = useState(chapter?.textbook_ref ?? '');
  const firstActive = editions.find((e) => e.status === 'active')?.id ?? null;
  const [edition, setEdition] = useState<string | null>(
    chapter ? chapter.curriculum_id : firstActive,
  );
  const [saving, setSaving] = useState(false);
  const f = useFormError();

  const save = async () => {
    if (saving) return;
    f.clear();
    const built = buildChapter({ titleEn, titleUr, textbookRef: ref, curriculumId: edition });
    if (!built.ok) return f.field(built.field, built.error);
    setSaving(true);
    const err = await onSave(built.value);
    setSaving(false);
    if (err) f.server(err);
  };

  const offered = editions.filter((e) => e.status === 'active' || e.id === chapter?.curriculum_id);
  return (
    <FormSheet
      title={t(chapter ? 'staff.curriculum.editChapter' : 'staff.curriculum.addChapter')}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={f.error}
    >
      <TextField
        label={t('staff.curriculum.fields.titleEn')}
        value={titleEn}
        onChangeText={setTitleEn}
        error={f.fieldErrors.titleEn}
        script="latin"
        autoFocus
        onSubmitEditing={save}
        maxLength={200}
      />
      <TextField
        label={t('staff.curriculum.fields.titleUr')}
        helper={t('staff.curriculum.fields.titleUrHelper')}
        value={titleUr}
        onChangeText={setTitleUr}
        error={f.fieldErrors.titleUr}
        script="urdu"
        onSubmitEditing={save}
        maxLength={200}
      />
      <TextField
        label={t('staff.curriculum.fields.textbookRef')}
        helper={t('staff.curriculum.fields.textbookRefHelper')}
        value={ref}
        onChangeText={setRef}
        error={f.fieldErrors.textbookRef}
        script="latin"
        onSubmitEditing={save}
        maxLength={120}
      />
      <ChipPicker
        label={t('staff.curriculum.fields.edition')}
        chips={[
          ...offered.map((e) => ({ value: e.id, label: e.code })),
          { value: NONE, label: t('staff.curriculum.noEdition') },
        ]}
        value={edition ?? NONE}
        onChange={(v) => setEdition(v === NONE ? null : v)}
      />
    </FormSheet>
  );
}

// ---- Edition (admin) -----------------------------------------------------------------

export function EditionSheet({
  edition,
  onClose,
  onSave,
}: {
  edition: Edition | null;
  onClose: () => void;
  onSave: (v: {
    code: string;
    board: string;
    name: string;
    effective_from: string | null;
  }) => Promise<CurriculumErrorKind | null>;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState(edition?.code ?? '');
  const [board, setBoard] = useState(edition?.board ?? 'Punjab Textbook Board');
  const [name, setName] = useState(edition?.name ?? '');
  const [from, setFrom] = useState(edition?.effective_from ?? '');
  const [saving, setSaving] = useState(false);
  const f = useFormError();

  const save = async () => {
    if (saving) return;
    f.clear();
    const built = buildEdition({ code, board, name, effectiveFrom: from });
    if (!built.ok) return f.field(built.field, built.error);
    setSaving(true);
    const err = await onSave(built.value);
    setSaving(false);
    if (err === 'duplicate') f.field('code', err);
    else if (err) f.server(err);
  };

  return (
    <FormSheet
      title={t(edition ? 'staff.curriculum.editions.edit' : 'staff.curriculum.editions.add')}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={f.error}
    >
      <TextField
        label={t('staff.curriculum.fields.code')}
        helper={t('staff.curriculum.fields.codeHelper')}
        value={code}
        onChangeText={setCode}
        error={f.fieldErrors.code}
        script="latin"
        autoCapitalize="characters"
        autoFocus
        onSubmitEditing={save}
        maxLength={40}
      />
      <TextField
        label={t('staff.curriculum.fields.name')}
        value={name}
        onChangeText={setName}
        error={f.fieldErrors.name}
        script="latin"
        onSubmitEditing={save}
        maxLength={160}
      />
      <TextField
        label={t('staff.curriculum.fields.board')}
        value={board}
        onChangeText={setBoard}
        error={f.fieldErrors.board}
        script="latin"
        onSubmitEditing={save}
        maxLength={120}
      />
      <TextField
        label={t('staff.curriculum.fields.effectiveFrom')}
        helper={t('staff.curriculum.fields.effectiveFromHelper')}
        value={from}
        onChangeText={setFrom}
        error={f.fieldErrors.effectiveFrom}
        script="latin"
        onSubmitEditing={save}
        maxLength={10}
        style={styles.narrow}
      />
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  error: { paddingVertical: space.xs },
  narrow: { maxWidth: 240 },
  section: {
    gap: space.sm,
    borderTopWidth: 1,
    paddingTop: space.md,
    marginTop: space.xs,
    borderRadius: radius.sm,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  options: { gap: space.xxs },
});
