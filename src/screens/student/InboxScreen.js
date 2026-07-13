// InboxScreen — the student's in-app message inbox.
//
// This is the fallback the messaging feature promises: whether or not a push
// notification ever arrived (OS permission off, offline, app was closed), every
// message a student is allowed to see is readable here. Rows are RLS-scoped in
// the DB (school / their current class / them) and loaded cache-first by the
// NotificationsProvider, so this screen opens instantly and works offline.
//
// Opening the inbox marks everything read (clears the bell badge). Messages
// newer than the last visit are flagged "New". Quest-themed + RTL like the rest
// of the student app.
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { Text } from '../../components';
import {
  QuestScreen,
  QuestHeader,
  QuestPanel,
  QuestBadge,
  QuestEmpty,
} from '../../components/quest';
import { useNotifications } from '../../notifications/NotificationsProvider';
import { t } from '../../i18n';
import { quest, spacing, displayText } from '../../theme/quest';

// A short, locale-neutral date (YYYY-MM-DD) — the format the whole app uses.
// Built from local parts so it doesn't roll a day at the UTC boundary.
function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Scope → badge tone + label key. 'class' reads as "Your class", 'student' as a
// personal note; 'school' is the whole-school announcement.
const SCOPE_TONE = { school: 'gold', class: 'green', student: 'sky' };

function MessageCard({ message, isNew }) {
  const tone = SCOPE_TONE[message.scope] ?? 'faint';
  return (
    <QuestPanel style={styles.card}>
      <View style={styles.cardHead}>
        <QuestBadge label={t(`student.inbox.scopes.${message.scope}`)} tone={tone} />
        {isNew ? (
          <QuestBadge label={t('student.inbox.new')} tone="red" style={styles.newBadge} />
        ) : null}
        <View style={styles.spacer} />
        <Text variant="caption" color={quest.faint}>
          {formatDate(message.created_at)}
        </Text>
      </View>
      <Text color={quest.ink} style={[styles.title, displayText(18)]}>
        {message.title}
      </Text>
      <Text variant="body" color={quest.ink} style={styles.body}>
        {message.body}
      </Text>
    </QuestPanel>
  );
}

export default function InboxScreen({ onBack }) {
  const { messages, loading, loadError, permission, lastReadAt, refresh, markAllRead } =
    useNotifications();

  // Capture "what was unread when I opened this" BEFORE marking read, so the
  // "New" flags stay visible for this viewing instead of vanishing instantly.
  const openedAt = lastReadAt;
  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  const isNew = (m) =>
    !openedAt || new Date(m.created_at).getTime() > new Date(openedAt).getTime();

  const showEmpty = !loading && !loadError && messages.length === 0;

  return (
    <QuestScreen scroll>
      <QuestHeader
        title={t('student.inbox.title')}
        subtitle={t('student.inbox.subtitle')}
        backLabel={t('student.inbox.back')}
        onBack={onBack}
      />

      {/* If OS notifications are off, say so honestly — messages still land here. */}
      {permission === 'denied' ? (
        <QuestPanel style={styles.notice} faceStyle={styles.noticeFace}>
          <Text variant="caption" color={quest.faint}>
            {t('student.inbox.permissionOff')}
          </Text>
        </QuestPanel>
      ) : null}

      {loading && messages.length === 0 ? (
        <ActivityIndicator color={quest.green} style={styles.loading} />
      ) : loadError && messages.length === 0 ? (
        <QuestEmpty
          sprite="scroll"
          tone="danger"
          message={t('student.inbox.loadError')}
          actionLabel={t('student.inbox.retry')}
          onAction={refresh}
        />
      ) : showEmpty ? (
        <QuestEmpty sprite="scroll" message={t('student.inbox.empty')} />
      ) : (
        <View style={styles.list}>
          {messages.map((m) => (
            <MessageCard key={m.id} message={m} isNew={isNew(m)} />
          ))}
        </View>
      )}
    </QuestScreen>
  );
}

const styles = StyleSheet.create({
  notice: { marginTop: spacing.md },
  noticeFace: { paddingVertical: spacing.sm },
  loading: { marginTop: spacing.xl },
  list: { marginTop: spacing.md },
  card: { marginBottom: spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  newBadge: { marginStart: spacing.xs },
  spacer: { flex: 1 },
  title: { marginBottom: spacing.xs },
  body: {},
});
