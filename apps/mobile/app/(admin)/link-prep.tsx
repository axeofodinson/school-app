import { normaliseAdmissionNo } from '@school/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { Badge, Button, Card, EmptyState, ListItem, Screen, Text, TextField } from '../../ui';

// Upgrade path (DECISIONS #59): a Google (prep-only) learner who joins the
// school keeps their practice. Staff find the Google account, find the student
// by admission number, give a reason, and link_prep_account() (db/023) moves
// the learning history to the student's school login. The Google account stays
// prep-only. The RPC re-checks is_staff(); this screen is convenience only.

interface PrepAccount {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  merged_into: string | null;
  attempts: number;
}

interface StudentMatch {
  id: string;
  full_name: string;
  student_code: string;
  hasLogin: boolean;
}

type Moved = Record<string, number>;

export default function LinkPrep() {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState<PrepAccount[] | null>(null);
  const [account, setAccount] = useState<PrepAccount | null>(null);
  const [admission, setAdmission] = useState('');
  const [student, setStudent] = useState<StudentMatch | null | 'none'>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState<Moved | null>(null);

  const search = async () => {
    setBusy(true);
    setError(null);
    setAccount(null);
    setMoved(null);
    if (!supabase) return setBusy(false);
    const { data, error: e } = await supabase.rpc('find_prep_accounts', {
      p_query: query.trim(),
    });
    setBusy(false);
    if (e) return setError(t('console.linkPrep.errors.server'));
    setAccounts((data ?? []).map((a) => ({ ...a, attempts: Number(a.attempts) })));
  };

  const findStudent = async () => {
    const code = normaliseAdmissionNo(admission);
    if (!code || code.includes('*') || !supabase) return setStudent('none');
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase
      .from('students')
      .select('id, full_name, student_code')
      .ilike(
        'student_code',
        code.replace(/[\\%_]/g, (c) => `\\${c}`),
      )
      .limit(1)
      .maybeSingle();
    if (e || !data) {
      setBusy(false);
      if (e) setError(t('console.linkPrep.errors.server'));
      return setStudent('none');
    }
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', data.id);
    setBusy(false);
    setStudent({ ...data, hasLogin: (count ?? 0) > 0 });
  };

  const link = async () => {
    if (!account || !student || student === 'none' || !reason.trim()) return;
    setBusy(true);
    setError(null);
    if (!supabase) return setBusy(false);
    const { data, error: e } = await supabase.rpc('link_prep_account', {
      p_prep_profile: account.id,
      p_student_id: student.id,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (e) {
      const msg = e.message ?? '';
      return setError(
        t(
          /no school login/.test(msg)
            ? 'console.linkPrep.errors.noLogin'
            : /another student/.test(msg)
              ? 'console.linkPrep.errors.otherStudent'
              : 'console.linkPrep.errors.server',
        ),
      );
    }
    setMoved((data as Moved | null) ?? {});
  };

  const canLink =
    account && student && student !== 'none' && student.hasLogin && reason.trim() && !busy;

  return (
    <Screen>
      <Button
        title={t('auth.settings.back')}
        icon="back"
        variant="ghost"
        size="sm"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/school'))}
        style={styles.back}
      />
      <Text variant="title" accessibilityRole="header">
        {t('console.linkPrep.title')}
      </Text>
      <Text tone="textMuted">{t('console.linkPrep.subtitle')}</Text>
      {!isSupabaseConfigured ? <Text tone="wrong">{t('auth.errors.notConfigured')}</Text> : null}

      <Card>
        <View style={styles.form}>
          <Text variant="heading">{t('console.linkPrep.step1')}</Text>
          <TextField
            label={t('console.linkPrep.searchLabel')}
            placeholder={t('console.linkPrep.searchPlaceholder')}
            value={query}
            onChangeText={setQuery}
            script="latin"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            title={t('console.linkPrep.search')}
            icon="search"
            variant="secondary"
            disabled={busy || query.trim().length < 3}
            onPress={search}
          />
          {accounts && accounts.length === 0 ? (
            <EmptyState
              icon="search"
              title={t('console.linkPrep.noAccounts')}
              body={t('console.linkPrep.noAccountsBody')}
            />
          ) : null}
          {accounts?.map((a) => (
            <ListItem
              key={a.id}
              title={a.email ?? a.full_name ?? a.id}
              subtitle={t('console.linkPrep.accountLine', {
                name: a.full_name ?? '—',
                attempts: a.attempts,
              })}
              trailing={
                a.merged_into ? (
                  <Badge label={t('console.linkPrep.linked')} tone="correct" />
                ) : account?.id === a.id ? (
                  <Badge label={t('console.linkPrep.chosen')} tone="primary" icon="check" />
                ) : undefined
              }
              onPress={() => {
                setAccount(a);
                setMoved(null);
              }}
            />
          ))}
        </View>
      </Card>

      {account ? (
        <Card>
          <View style={styles.form}>
            <Text variant="heading">{t('console.linkPrep.step2')}</Text>
            <TextField
              label={t('auth.student.admissionNumber')}
              value={admission}
              onChangeText={(v) => {
                setAdmission(v);
                setStudent(null);
              }}
              script="latin"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={32}
            />
            <Button
              title={t('console.linkPrep.findStudent')}
              variant="secondary"
              disabled={busy || !admission.trim()}
              onPress={findStudent}
            />
            {student === 'none' ? (
              <Text tone="onWrongSoft">{t('console.linkPrep.noStudent')}</Text>
            ) : student ? (
              <View style={styles.form}>
                <ListItem title={student.full_name} subtitle={student.student_code} />
                {student.hasLogin ? null : (
                  <Text tone="onWrongSoft">{t('console.linkPrep.errors.noLogin')}</Text>
                )}
                <TextField
                  label={t('console.linkPrep.reason')}
                  placeholder={t('console.linkPrep.reasonPlaceholder')}
                  value={reason}
                  onChangeText={setReason}
                />
                <Text tone="textMuted">{t('console.linkPrep.explain')}</Text>
                <Button
                  title={t('console.linkPrep.link')}
                  icon="lock"
                  loading={busy}
                  disabled={!canLink}
                  onPress={link}
                />
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}

      {error ? (
        <Text tone="onWrongSoft" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {moved ? (
        <Card>
          <Text accessibilityLiveRegion="polite">
            {t('console.linkPrep.done', {
              attempts: moved.practice_attempts ?? 0,
              mastery: moved.concept_mastery ?? 0,
              followUps: moved.follow_ups ?? 0,
            })}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start' },
  form: { gap: 12 },
});
