// Admin: textbook editions (curricula) and the backfill helper that attaches
// chapters made before editions existed (prompt 20). Attaching never moves a
// chapter that already has an edition (the update filters on curriculum_id is
// null), so two admins, or a re-run, can't undo each other.
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Button, EmptyState, Reveal, Text, useTheme, useToast } from '../../ui';
import { radius, space } from '../../ui/tokens';
import { ChipPicker } from '../scope/ChipPicker';
import { LoadState } from '../scope/LoadState';
import { useResult } from '../scope/useResult';
import {
  attachChapters,
  listEditions,
  listLooseChapters,
  saveEdition,
  type CurriculumErrorKind,
  type Edition,
  type LooseChapter,
} from './api';
import { CheckRow } from './CheckRow';
import { EditionSheet, errorKey } from './EditSheets';

export function EditionsPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const editions = useResult('editions', listEditions);
  const loose = useResult('loose', listLooseChapters);
  const [editing, setEditing] = useState<{ edition: Edition | null } | null>(null);

  const list = editions.state?.status === 'ready' ? editions.state.data : null;

  const save = async (v: {
    code: string;
    board: string;
    name: string;
    effective_from: string | null;
  }): Promise<CurriculumErrorKind | null> => {
    const res = await saveEdition(editing?.edition?.id ?? null, v);
    if (!res.ok) return res.error;
    toast(
      t(editing?.edition ? 'staff.curriculum.saved' : 'staff.curriculum.editions.added'),
      'success',
    );
    setEditing(null);
    editions.reload();
    return null;
  };

  const setStatus = async (e: Edition, status: 'active' | 'retired') => {
    const res = await saveEdition(e.id, {
      code: e.code,
      board: e.board,
      name: e.name,
      effective_from: e.effective_from,
      status,
    });
    if (!res.ok) return toast(t(errorKey(res.error)), 'warn');
    toast(
      t(status === 'retired' ? 'staff.curriculum.retiredToast' : 'staff.curriculum.restoredToast'),
      'success',
    );
    editions.reload();
  };

  return (
    <View style={styles.wrap}>
      <Reveal index={2} style={styles.section}>
        <View style={styles.head}>
          <Text variant="heading" accessibilityRole="header">
            {t('staff.curriculum.editions.heading')}
          </Text>
          {list?.length ? (
            <Button
              title={t('staff.curriculum.editions.add')}
              icon="plus"
              size="sm"
              onPress={() => setEditing({ edition: null })}
            />
          ) : null}
        </View>
        <Text tone="textMuted">{t('staff.curriculum.editions.body')}</Text>
        <LoadState
          state={editions.state}
          title={t('staff.curriculum.errors.loadError')}
          onRetry={editions.reload}
        />
        {list && list.length === 0 ? (
          <EmptyState
            icon="book"
            title={t('staff.curriculum.editions.empty')}
            body={t('staff.curriculum.editions.emptyBody')}
            action={
              <Button
                title={t('staff.curriculum.editions.add')}
                icon="plus"
                onPress={() => setEditing({ edition: null })}
              />
            }
          />
        ) : null}
        <View style={styles.grid}>
          {(list ?? []).map((e, i) => (
            <Reveal key={e.id} index={i + 3} style={styles.cell}>
              <EditionCard
                edition={e}
                onEdit={() => setEditing({ edition: e })}
                onRetire={() => setStatus(e, e.status === 'retired' ? 'active' : 'retired')}
              />
            </Reveal>
          ))}
        </View>
      </Reveal>

      <Reveal index={4} style={styles.section}>
        <Attach
          editions={(list ?? []).filter((e) => e.status === 'active')}
          loose={loose.state?.status === 'ready' ? loose.state.data : null}
          loadState={loose.state}
          onRetry={loose.reload}
          onAttached={loose.reload}
        />
      </Reveal>

      {editing ? (
        <EditionSheet edition={editing.edition} onClose={() => setEditing(null)} onSave={save} />
      ) : null}
    </View>
  );
}

function EditionCard({
  edition,
  onEdit,
  onRetire,
}: {
  edition: Edition;
  onEdit: () => void;
  onRetire: () => void;
}) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const retired = edition.status === 'retired';
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colours.surface,
          borderColor: colours.border,
          borderTopColor: retired ? colours.borderStrong : colours.primary,
          opacity: retired ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.cardHead}>
        <Badge label={edition.code} tone="primary" icon="book" />
        {retired ? <Badge label={t('staff.curriculum.retired')} icon="archive" /> : null}
      </View>
      <Text variant="heading">{edition.name}</Text>
      <Text tone="textMuted">{edition.board}</Text>
      {edition.effective_from ? (
        <Text variant="bodySm" tone="textMuted">
          {t('staff.curriculum.editions.from', { date: edition.effective_from })}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          title={t('staff.curriculum.editions.edit')}
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
          accessibilityHint={t('staff.curriculum.editions.retireHint')}
          onPress={onRetire}
        />
      </View>
    </View>
  );
}

function Attach({
  editions,
  loose,
  loadState,
  onRetry,
  onAttached,
}: {
  editions: Edition[];
  loose: LooseChapter[] | null;
  loadState: Parameters<typeof LoadState>[0]['state'];
  onRetry: () => void;
  onAttached: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const { colours } = useTheme();
  const [pickedEdition, setEdition] = useState<string | null>(null);
  const [ticked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const edition = editions.some((e) => e.id === pickedEdition)
    ? pickedEdition
    : (editions[0]?.id ?? null);
  // Only chapters that are still loose count (after a reload some are attached).
  const picked = useMemo(() => {
    const ids = new Set((loose ?? []).map((c) => c.id));
    return new Set([...ticked].filter((id) => ids.has(id)));
  }, [ticked, loose]);

  const groups = useMemo(() => {
    const m = new Map<string, LooseChapter[]>();
    for (const c of loose ?? []) {
      const key = `${c.className} · ${c.subjectName}`;
      m.set(key, [...(m.get(key) ?? []), c]);
    }
    return [...m.entries()];
  }, [loose]);

  const toggle = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  const attach = async () => {
    if (!edition || !picked.size || saving) return;
    setSaving(true);
    const ids = [...picked];
    const res = await attachChapters(edition, ids);
    setSaving(false);
    if (!res.ok) return toast(t(errorKey(res.error)), 'warn');
    const code = editions.find((e) => e.id === edition)?.code ?? '';
    toast(t('staff.curriculum.attach.done', { count: res.data, edition: code }), 'success');
    if (res.data < ids.length) {
      toast(t('staff.curriculum.attach.skipped', { count: ids.length - res.data }), 'info');
    }
    setPicked(new Set());
    onAttached();
  };

  return (
    <>
      <Text variant="heading" accessibilityRole="header">
        {t('staff.curriculum.attach.heading')}
      </Text>
      <Text tone="textMuted">{t('staff.curriculum.attach.body')}</Text>
      <LoadState
        state={loadState}
        title={t('staff.curriculum.errors.loadError')}
        onRetry={onRetry}
      />
      {loose && loose.length === 0 ? (
        <EmptyState icon="checkCircle" title={t('staff.curriculum.attach.none')} />
      ) : null}
      {loose && loose.length > 0 && editions.length === 0 ? (
        <EmptyState icon="book" title={t('staff.curriculum.attach.needEdition')} />
      ) : null}
      {loose && loose.length > 0 && editions.length > 0 ? (
        <>
          <ChipPicker
            label={t('staff.curriculum.attach.pickEdition')}
            chips={editions.map((e) => ({ value: e.id, label: e.code }))}
            value={edition}
            onChange={setEdition}
          />
          <View style={styles.toolbar}>
            <Button
              title={t('staff.curriculum.attach.selectAll', { count: loose.length })}
              variant="secondary"
              size="sm"
              onPress={() =>
                toggle(
                  loose.map((c) => c.id),
                  true,
                )
              }
            />
            {picked.size ? (
              <Button
                title={t('staff.curriculum.attach.selectNone')}
                variant="ghost"
                size="sm"
                onPress={() => setPicked(new Set())}
              />
            ) : null}
          </View>
          {groups.map(([group, rows]) => {
            const all = rows.every((r) => picked.has(r.id));
            return (
              <View
                key={group}
                style={[
                  styles.group,
                  { borderColor: colours.border, backgroundColor: colours.surface },
                ]}
              >
                <CheckRow
                  label={group}
                  detail={t('staff.curriculum.editions.chapters', { count: rows.length })}
                  checked={all}
                  onToggle={() =>
                    toggle(
                      rows.map((r) => r.id),
                      !all,
                    )
                  }
                />
                <View style={styles.indent}>
                  {rows.map((r) => (
                    <CheckRow
                      key={r.id}
                      label={r.title}
                      checked={picked.has(r.id)}
                      onToggle={() => toggle([r.id], !picked.has(r.id))}
                    />
                  ))}
                </View>
              </View>
            );
          })}
          <Button
            title={t('staff.curriculum.attach.attach', { count: picked.size })}
            icon="link"
            disabled={!picked.size || !edition}
            loading={saving}
            onPress={attach}
            style={styles.start}
          />
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xl, paddingBottom: space.xl },
  section: { gap: space.md },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cell: { flexGrow: 1, flexBasis: 260, maxWidth: 520 },
  card: {
    padding: space.lg,
    gap: space.xs,
    borderWidth: 1,
    borderTopWidth: 10,
    borderRadius: radius.md,
  },
  cardHead: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  group: { borderWidth: 1, borderRadius: radius.md, padding: space.xs, gap: space.xxs },
  indent: { paddingStart: space.xl, gap: space.xxs },
  start: { alignSelf: 'flex-start' },
});
