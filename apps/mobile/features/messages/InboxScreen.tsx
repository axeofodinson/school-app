// The student's inbox (prompt 15): school-wide, class and personal messages,
// newest first. New ones are marked until tapped (or "Mark all as read"); read
// state is kept on the server (db/029) so it matches on every device. Opens
// offline from the device copy.
import type { InboxMessage } from '@school/core';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Reveal,
  Screen,
  SkeletonLines,
  Text,
  useTheme,
  type IconName,
} from '../../ui';
import { space } from '../../ui/tokens';
import { StudentHeader } from '../attempts/Header';
import { useMessages } from './MessagesProvider';
import { PUSH_SUPPORTED } from './push';
import { formatWhen } from './when';

const SCOPE_LABEL: Record<InboxMessage['scope'], TKey> = {
  school: 'student.inbox.scopes.school',
  class: 'student.inbox.scopes.class',
  student: 'student.inbox.scopes.student',
};

const SCOPE_ICON: Record<InboxMessage['scope'], IconName> = {
  school: 'home',
  class: 'users',
  student: 'user',
};

function MessageCard({ m, unread, onRead }: { m: InboxMessage; unread: boolean; onRead(): void }) {
  const { t } = useI18n();
  const { colours } = useTheme();
  return (
    <Card
      onPress={unread ? onRead : undefined}
      style={unread ? { borderColor: colours.primary, borderWidth: 2 } : undefined}
    >
      <View style={styles.meta}>
        <View
          style={[
            styles.scopeIcon,
            { backgroundColor: unread ? colours.primarySoft : colours.surfaceAlt },
          ]}
        >
          <Icon
            name={SCOPE_ICON[m.scope] ?? 'home'}
            size={18}
            tone={unread ? 'onPrimarySoft' : 'textMuted'}
          />
        </View>
        {unread ? <Badge label={t('student.inbox.new')} tone="primary" icon="star" /> : null}
        <Badge label={t(SCOPE_LABEL[m.scope] ?? SCOPE_LABEL.school)} tone="neutral" />
        <Text variant="caption" tone="textMuted">
          {formatWhen(m.created_at, t)}
        </Text>
      </View>
      <Text variant="heading">{m.title}</Text>
      <Text>{m.body}</Text>
    </Card>
  );
}

export function InboxScreen() {
  const { t } = useI18n();
  const inbox = useMessages();
  const { messages, readIds, unreadCount } = inbox;
  return (
    <Screen
      header={
        <StudentHeader title={t('student.inbox.title')} subtitle={t('student.inbox.subtitle')} />
      }
    >
      <View style={styles.top}>
        {unreadCount > 0 ? (
          <Button
            title={t('student.inbox.markAllRead')}
            icon="check"
            variant="secondary"
            size="sm"
            onPress={() => void inbox.markAllRead()}
          />
        ) : null}
      </View>
      {PUSH_SUPPORTED && inbox.push === 'denied' ? (
        <Text variant="caption" tone="textMuted">
          {t('student.inbox.permissionOff')}
        </Text>
      ) : null}
      {inbox.offline ? (
        <Text variant="caption" tone="textMuted">
          {t('student.inbox.offline')}
        </Text>
      ) : null}
      {inbox.loading && messages.length === 0 ? (
        <SkeletonLines lines={4} />
      ) : inbox.failed ? (
        <EmptyState
          icon="warning"
          title={t('student.inbox.loadError')}
          action={<Button title={t('student.inbox.retry')} onPress={() => void inbox.refresh()} />}
        />
      ) : messages.length === 0 ? (
        <EmptyState icon="info" title={t('student.inbox.empty')} />
      ) : (
        <View style={styles.list}>
          {messages.map((m, i) => (
            <Reveal key={m.id} index={i}>
              <MessageCard
                m={m}
                unread={!readIds.has(m.id)}
                onRead={() => void inbox.markOneRead(m.id)}
              />
            </Reveal>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  scopeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  list: { gap: space.md },
});
