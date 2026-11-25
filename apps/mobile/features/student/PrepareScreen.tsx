// The Prepare tab (wireframe "Prepare: follow-ups first"). Follow-ups, practice and
// revision arrive with prompts 31/41/42; until then this is a real empty state that
// says what will appear here and offers the one useful thing to do now.
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { MosaicMark } from '../../ui/MorphTile';
import { Button, Card, Icon, Reveal, Screen, Text, useTheme, type IconName } from '../../ui';
import { PatternFill } from '../../ui/Pattern';
import { space, subjectHues, type SubjectHue } from '../../ui/tokens';
import { StudentHeader } from '../attempts/Header';
import { useHome } from '../attempts/useHome';
import { LessonList } from '../learn/LessonList';
import { useStudentNav } from './StudentNav';

const STEPS: { icon: IconName; key: 'followUps' | 'practice' | 'revise'; hue: SubjectHue }[] = [
  { icon: 'warning', key: 'followUps', hue: 'coral' },
  { icon: 'pencil', key: 'practice', hue: 'sky' },
  { icon: 'star', key: 'revise', hue: 'sunflower' },
];

export function PrepareScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { colours, scheme } = useTheme();
  const nav = useStudentNav('prepare');
  const home = useHome(false);
  // The class whose lessons to list: undefined while loading, null = every class.
  const classId =
    home.state?.status === 'ready'
      ? typeof home.state.data.enrollment === 'object'
        ? home.state.data.enrollment.classId
        : null
      : home.state?.status === 'error'
        ? null
        : undefined;
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;
  return (
    <Screen
      header={
        <StudentHeader
          tab
          title={t('student.prepare.title')}
          subtitle={t('student.prepare.subtitle')}
        />
      }
      {...nav}
    >
      <Reveal index={1}>
        <LessonList classId={classId} />
      </Reveal>
      <Reveal index={2}>
        <View
          style={[
            styles.soon,
            { backgroundColor: subjectHues.lilac[scheme], borderColor: outline },
          ]}
        >
          <PatternFill name="hexFlower" animated />
          <View style={[styles.badge, { backgroundColor: colours.surface, borderColor: outline }]}>
            <MosaicMark size={34} colour={colours.ink} fill={colours.surface} />
          </View>
          <Text variant="heading" tone="ink" style={styles.centre} accessibilityRole="header">
            {t('student.prepare.soonTitle')}
          </Text>
          <Text tone="ink" style={styles.centre}>
            {t('student.prepare.soonBody')}
          </Text>
        </View>
      </Reveal>
      {STEPS.map((s, i) => (
        <Reveal key={s.key} index={i + 3}>
          <Card>
            <View style={styles.row}>
              <View
                style={[
                  styles.stepIcon,
                  { backgroundColor: subjectHues[s.hue][scheme], borderColor: outline },
                ]}
              >
                <Icon name={s.icon} size={22} colour={colours.ink} />
              </View>
              <View style={styles.flex}>
                <Text variant="heading">{t(`student.prepare.${s.key}.title`)}</Text>
                <Text variant="bodySm" tone="textMuted">
                  {t(`student.prepare.${s.key}.body`)}
                </Text>
              </View>
            </View>
          </Card>
        </Reveal>
      ))}
      <Reveal index={6}>
        <Button
          title={t('student.prepare.goTests')}
          icon="clipboard"
          onPress={() => router.replace('/tests')}
        />
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  soon: {
    overflow: 'hidden',
    alignItems: 'center',
    gap: space.sm,
    padding: space.xl,
    borderRadius: 24,
    borderWidth: 2,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  centre: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: 2 },
});
