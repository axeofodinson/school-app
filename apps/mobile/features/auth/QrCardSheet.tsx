// Admin: printable QR login cards (A4, 10 per page). A card shows the student's
// name, class and admission number, and a QR holding the admission number only.
// Never a PIN (LMS_AUDIT 5.9: a QR with the PIN is a printed password).
import { cardSheetHtml, encodeStudentQr, qrSvg, type QrCard } from '@school/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { Button, Card, EmptyState, Skeleton, Text, useToast } from '../../ui';
import { printHtml } from './print-html';
import { qrMatrix } from './qr-matrix';
import { QrCode } from './QrCode';

interface Row {
  studentId: string;
  name: string;
  admissionNo: string;
  classId: string;
  className: string;
  classOrder: number;
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: Row[] };

async function fetchRows(): Promise<Row[]> {
  if (!supabase) throw new Error('not configured');
  // Active enrollments only: a withdrawn student's login is revoked (db/009),
  // so their card would not work. RLS: staff read all enrollments.
  const { data, error } = await supabase
    .from('enrollments')
    .select('student_id, class_id, classes(name, sort_order), students(full_name, student_code)')
    .eq('status', 'active');
  if (error) throw error;
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const e of data ?? []) {
    if (!e.students || !e.classes || seen.has(e.student_id)) continue;
    seen.add(e.student_id);
    rows.push({
      studentId: e.student_id,
      name: e.students.full_name,
      admissionNo: e.students.student_code,
      classId: e.class_id,
      className: e.classes.name,
      classOrder: e.classes.sort_order,
    });
  }
  return rows.sort(
    (a, b) =>
      a.classOrder - b.classOrder ||
      a.className.localeCompare(b.className) ||
      a.name.localeCompare(b.name),
  );
}

export function QrCardSheet() {
  const { t, isRTL } = useI18n();
  const toast = useToast();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [classId, setClassId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const run = useCallback(() => {
    fetchRows()
      .then((rows) => setLoad({ state: 'ready', rows }))
      .catch(() => setLoad({ state: 'error' }));
  }, []);
  useEffect(run, [run]);
  const refresh = () => {
    setLoad({ state: 'loading' });
    run();
  };

  const rows = useMemo(() => (load.state === 'ready' ? load.rows : []), [load]);
  const classes = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.classId, r.className);
    return [...m];
  }, [rows]);
  const shown = useMemo(
    () => (classId ? rows.filter((r) => r.classId === classId) : rows),
    [rows, classId],
  );

  const print = async () => {
    setPrinting(true);
    try {
      const cards: QrCard[] = shown.map((r) => ({
        name: r.name,
        admissionNo: r.admissionNo,
        className: r.className,
        qrSvg: qrSvg(qrMatrix(encodeStudentQr(r.admissionNo))),
      }));
      await printHtml(
        cardSheetHtml(
          cards,
          {
            title: t('auth.cards.title'),
            school: t('auth.cards.school'),
            admissionNo: t('auth.cards.admissionNo'),
            footer: t('auth.cards.footer'),
          },
          isRTL ? 'rtl' : 'ltr',
        ),
      );
    } catch {
      toast(t('auth.cards.error'), 'warn');
    } finally {
      setPrinting(false);
    }
  };

  if (load.state === 'loading') return <Skeleton height={120} />;
  if (load.state === 'error') {
    return (
      <EmptyState
        icon="cloudOff"
        title={t('auth.cards.error')}
        action={<Button title={t('auth.cards.retry')} onPress={refresh} />}
      />
    );
  }
  if (rows.length === 0) return <EmptyState icon="user" title={t('auth.cards.empty')} />;

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        <Button
          title={t('auth.cards.allClasses')}
          size="sm"
          variant={classId === null ? 'primary' : 'secondary'}
          onPress={() => setClassId(null)}
        />
        {classes.map(([id, name]) => (
          <Button
            key={id}
            title={name}
            size="sm"
            variant={classId === id ? 'primary' : 'secondary'}
            onPress={() => setClassId(id)}
          />
        ))}
      </View>
      <View style={styles.printRow}>
        <Text>{t('auth.cards.count', { count: shown.length })}</Text>
        <Button
          title={t('auth.cards.print')}
          onPress={print}
          loading={printing}
          disabled={printing || shown.length === 0}
        />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(r) => r.studentId}
        initialNumToRender={8}
        windowSize={5}
        scrollEnabled={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.card}>
              <QrCode value={encodeStudentQr(item.admissionNo)} size={88} />
              <View style={styles.info}>
                <Text variant="label">{item.name}</Text>
                <Text variant="bodySm">{item.className}</Text>
                <Text variant="bodySm" script="latin">
                  {`${t('auth.cards.admissionNo')} ${item.admissionNo}`}
                </Text>
              </View>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  printRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  list: { gap: 12 },
  card: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  info: { flex: 1, gap: 4 },
});
