// InboxBell — the header bell that opens the in-app inbox, with an unread badge.
//
// Lives on the student home. The badge count comes straight from the
// NotificationsProvider (messages newer than last-read), so it paints instantly
// from cache and works offline. Sized as a comfortable tap target; mirrors under
// RTL for free because it's a single centered element.
import { Pressable, View, StyleSheet } from 'react-native';

import Text from '../components/Text';
import { useNotifications } from './NotificationsProvider';
import { t } from '../i18n';
import { quest, px } from '../theme/quest';

export default function InboxBell({ onPress }) {
  const { unreadCount } = useNotifications();
  const showBadge = unreadCount > 0;
  // Cap the label so a flood of messages doesn't blow out the badge width.
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        showBadge
          ? t('student.inbox.bellUnread', { count: unreadCount })
          : t('student.inbox.bell')
      }
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      hitSlop={8}
    >
      <Text style={styles.icon}>🔔</Text>
      {showBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeLabel}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  icon: { fontSize: 26 },
  badge: {
    position: 'absolute',
    top: 2,
    // Logical end so the badge sits on the trailing corner in both LTR and RTL.
    end: 2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: px.border,
    borderColor: quest.bg,
    backgroundColor: quest.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: quest.cream,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
});
