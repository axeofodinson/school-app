import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { translate, useI18n } from '../../i18n';
import { VisualsSection } from './VisualsSection';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ExamMode,
  IconButton,
  LanguageToggle,
  ListItem,
  MasteryChip,
  MosaicTiles,
  MotionOverride,
  PatternBand,
  PinField,
  Screen,
  SegmentedControl,
  Sheet,
  SkeletonLines,
  SubjectCard,
  SyncStatusPill,
  Tabs,
  Text,
  TextField,
  ThemeProvider,
  TwoPane,
  useMotion,
  useTheme,
  useToast,
  Icon,
  type Scheme,
  type SyncStatus,
} from '../../ui';
import {
  behaviourProps,
  colours,
  moments,
  motionSettings,
  radius,
  resolveMoment,
  space,
  urduSpecimens,
  type ColourRoles,
  type MomentName,
  type MotionSetting,
  type PresentationId,
  type TypeStep,
} from '../../ui/tokens';

const PRESENTATIONS: PresentationId[] = ['kid', 'student', 'staff'];
const STEPS: TypeStep[] = ['display', 'title', 'heading', 'body', 'bodySm', 'caption', 'label'];
const STATUSES: SyncStatus[] = ['idle', 'syncing', 'saved', 'offline', 'error'];
const pick = <T extends string>(v: unknown, all: readonly T[], fallback: T): T =>
  typeof v === 'string' && (all as readonly string[]).includes(v) ? (v as T) : fallback;

/**
 * Every ui/ component in the current language × theme × presentation × motion tier,
 * with exam mode. Acceptance surface for prompt 02 (DESIGN_SYSTEM.md §4 "Gallery").
 */
export function Gallery() {
  const params = useLocalSearchParams<{
    lang?: string;
    theme?: string;
    tier?: string;
    p?: string;
    exam?: string;
  }>();
  const { setLocale } = useI18n();
  const [scheme, setScheme] = useState<Scheme>(
    pick<Scheme>(params.theme, ['light', 'dark'], 'light'),
  );
  const [tier, setTier] = useState<MotionSetting>(
    pick<MotionSetting>(params.tier, motionSettings, 'auto'),
  );
  const [presentation, setPresentation] = useState<PresentationId>(
    pick<PresentationId>(params.p, PRESENTATIONS, 'student'),
  );
  const [exam, setExam] = useState(params.exam === '1');

  useEffect(() => {
    if (params.lang === 'en' || params.lang === 'ur') setLocale(params.lang);
  }, [params.lang, setLocale]);

  return (
    <ThemeProvider scheme={scheme} presentation={presentation}>
      <MotionOverride setting={tier}>
        <ExamMode active={exam}>
          <GalleryBody
            controls={{
              scheme,
              setScheme,
              tier,
              setTier,
              presentation,
              setPresentation,
              exam,
              setExam,
            }}
          />
        </ExamMode>
      </MotionOverride>
    </ThemeProvider>
  );
}

type Controls = {
  scheme: Scheme;
  setScheme: (s: Scheme) => void;
  tier: MotionSetting;
  setTier: (s: MotionSetting) => void;
  presentation: PresentationId;
  setPresentation: (p: PresentationId) => void;
  exam: boolean;
  setExam: (e: boolean) => void;
};

function GalleryBody({ controls: c }: { controls: Controls }) {
  const { t } = useI18n();
  const motion = useMotion();
  const [replay, setReplay] = useState(0);
  return (
    <Screen>
      <Text variant="display" accessibilityRole="header">
        {t('dev.gallery.title')}
      </Text>
      <Text tone="textMuted">{t('dev.gallery.intro')}</Text>

      <Card>
        <Control label={t('dev.gallery.language')}>
          <LanguageToggle />
        </Control>
        <Control label={t('dev.gallery.theme')}>
          <SegmentedControl
            accessibilityLabel={t('dev.gallery.theme')}
            segments={[
              { value: 'light', label: t('ui.theme.light') },
              { value: 'dark', label: t('ui.theme.dark') },
            ]}
            value={c.scheme}
            onChange={c.setScheme}
          />
        </Control>
        <Control label={t('dev.gallery.presentation')}>
          <SegmentedControl
            accessibilityLabel={t('dev.gallery.presentation')}
            segments={PRESENTATIONS.map((p) => ({ value: p, label: t(`ui.presentation.${p}`) }))}
            value={c.presentation}
            onChange={c.setPresentation}
          />
        </Control>
        <Control label={t('dev.gallery.motion')}>
          <SegmentedControl
            accessibilityLabel={t('dev.gallery.motion')}
            segments={motionSettings.map((m) => ({ value: m, label: t(`ui.motion.${m}`) }))}
            value={c.tier}
            onChange={c.setTier}
          />
        </Control>
        <Control label={t('dev.gallery.exam')}>
          <SegmentedControl
            accessibilityLabel={t('dev.gallery.exam')}
            segments={[
              { value: 'off', label: t('dev.gallery.examOff') },
              { value: 'on', label: t('dev.gallery.examOn') },
            ]}
            value={c.exam ? 'on' : 'off'}
            onChange={(v) => c.setExam(v === 'on')}
          />
          <Text variant="bodySm" tone="textMuted">
            {t('dev.gallery.examHint')}
          </Text>
        </Control>
        <Text variant="bodySm" tone="textMuted">
          {t('dev.gallery.tierNow', {
            tier: t(`ui.motion.${motion.tier}`),
            memory: motion.memoryGb
              ? t('dev.gallery.memoryGb', { count: motion.memoryGb })
              : t('dev.gallery.unknown'),
          })}
        </Text>
        {motion.osReduceMotion ? (
          <Badge tone="accent" icon="info" label={t('dev.gallery.osReduce')} />
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          icon="syncing"
          title={t('dev.gallery.replay')}
          onPress={() => setReplay((n) => n + 1)}
        />
      </Card>

      <View key={replay} style={styles.sections}>
        <TypeSection />
        <ColourSection />
        <ButtonSection />
        <BadgeSection />
        <CardSection />
        <InputSection />
        <MosaicSection />
        <FeedbackSection />
        <NavigationSection />
        <LayoutSection />
        <MotionSection />
        <VisualsSection />
      </View>
    </Screen>
  );
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.control}>
      <Text variant="label">{label}</Text>
      {children}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function TypeSection() {
  const { t } = useI18n();
  const english = translate('en', 'student.attempt.submitted');
  return (
    <Section title={t('dev.gallery.sections.type')}>
      {STEPS.map((step) => (
        <Card key={step}>
          <Text variant="caption" tone="textMuted" script="latin">
            {step}
          </Text>
          <Text variant={step}>{english}</Text>
          <Text variant={step}>{urduSpecimens[0].text}</Text>
        </Card>
      ))}
      <Card>
        {urduSpecimens.map((s) => (
          <View key={s.id}>
            <Text variant="caption" tone="textMuted" script="latin">
              {s.id}
            </Text>
            <Text>{s.text}</Text>
          </View>
        ))}
      </Card>
    </Section>
  );
}

function ColourSection() {
  const { t } = useI18n();
  const { scheme, colours: c } = useTheme();
  const roles = Object.keys(colours.light) as (keyof ColourRoles)[];
  return (
    <Section title={t('dev.gallery.sections.colours')}>
      <View style={styles.wrap}>
        {roles.map((r) => (
          <View key={r} style={styles.swatch}>
            <View style={[styles.chip, { backgroundColor: c[r], borderColor: c.border }]} />
            <Text variant="caption" script="latin">
              {r}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="caption" tone="textMuted" script="latin">
        {scheme}
      </Text>
    </Section>
  );
}

function ButtonSection() {
  const { t } = useI18n();
  return (
    <Section title={t('dev.gallery.sections.buttons')}>
      <View style={styles.wrap}>
        <Button title={t('auth.student.submit')} icon="forward" />
        <Button variant="secondary" title={t('console.grading.cancel')} />
        <Button variant="ghost" title={t('auth.student.staffLinkAction')} />
        <Button variant="danger" title={t('auth.signOut')} />
      </View>
      <View style={styles.wrap}>
        <Button size="sm" title={t('console.classes.save')} />
        <Button size="md" title={t('console.classes.save')} />
        <Button size="lg" title={t('console.classes.save')} />
        <Button loading title={t('console.classes.saving')} />
        <Button disabled title={t('console.classes.save')} />
      </View>
      <View style={styles.wrap}>
        <IconButton icon="close" label={t('ui.close')} />
        <IconButton icon="language" variant="secondary" label={t('common.language')} />
        <IconButton icon="home" variant="primary" label={t('student.home.title')} />
        <IconButton icon="book" selected label={t('student.home.assessments')} />
        <IconButton icon="back" label={t('ui.close')} />
      </View>
    </Section>
  );
}

function BadgeSection() {
  const { t } = useI18n();
  return (
    <Section title={t('dev.gallery.sections.badges')}>
      <View style={styles.wrap}>
        <Badge label={t('student.assessments.status.pending')} />
        <Badge tone="primary" icon="star" label={t('student.home.welcome')} />
        <Badge tone="accent" icon="clock" label={t('console.assessments.statuses.closed')} />
        <Badge tone="correct" icon="check" label={t('student.assessments.status.submitted')} />
        <Badge tone="wrong" icon="warning" label={t('auth.studentErrors.wrongPin')} />
      </View>
      <View style={styles.wrap}>
        <MasteryChip band="learning" />
        <MasteryChip band="weak" />
        <MasteryChip band="mastered" />
      </View>
    </Section>
  );
}

function CardSection() {
  const { t } = useI18n();
  return (
    <Section title={t('dev.gallery.sections.cards')}>
      <Card>
        <Text variant="heading">{t('student.home.assessments')}</Text>
        <Text tone="textMuted">{t('student.home.assessmentsNote')}</Text>
      </Card>
      <Card onPress={() => undefined}>
        <Text variant="heading">{t('student.home.report')}</Text>
        <Text tone="textMuted">{t('student.home.reportNote')}</Text>
      </Card>
      <Card padded={false}>
        <ListItem
          leading={<Icon name="tasks" />}
          title={t('student.home.assessments')}
          subtitle={t('student.home.assessmentsNote')}
          onPress={() => undefined}
        />
        <ListItem
          leading={<Icon name="star" />}
          title={t('student.home.scores')}
          subtitle={t('student.home.scoresNote')}
          onPress={() => undefined}
        />
        <ListItem
          leading={<Icon name="clock" />}
          title={t('student.home.attendance')}
          trailing={<Badge tone="correct" label={t('student.assessments.status.submitted')} />}
        />
      </Card>
    </Section>
  );
}

function InputSection() {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('12');
  return (
    <Section title={t('dev.gallery.sections.inputs')}>
      <TextField
        label={t('auth.student.admissionNumber')}
        placeholder={t('auth.student.admissionNumberPlaceholder')}
        script="latin"
        value={code}
        onChangeText={setCode}
        helper={t('auth.student.subtitle')}
      />
      <TextField
        label={t('auth.login.password')}
        placeholder={t('auth.login.passwordPlaceholder')}
        secureTextEntry
        error={t('auth.errors.invalidCredentials')}
      />
      <PinField label={t('auth.student.pin')} value={pin} onChange={setPin} />
      <PinField
        label={t('auth.student.pin')}
        value={pin2}
        onChange={setPin2}
        keypad
        error={t('auth.studentErrors.wrongPin')}
      />
    </Section>
  );
}

const SUBJECTS = [
  { id: 'demo-maths', key: 'dev.gallery.sample.subject', mastered: 7, total: 12, band: 'learning' },
  { id: 'demo-science', key: 'dev.gallery.sample.subject2', mastered: 3, total: 10, band: 'weak' },
  { id: 'demo-urdu', key: 'dev.gallery.sample.subject3', mastered: 9, total: 9, band: 'mastered' },
] as const;

function MosaicSection() {
  const { t } = useI18n();
  return (
    <Section title={t('dev.gallery.sections.mosaic')}>
      <View style={styles.grid}>
        {SUBJECTS.map((s, i) => (
          <View key={s.id} style={styles.cell}>
            <SubjectCard
              subject={{
                id: s.id,
                name: t(s.key),
                mastered: s.mastered,
                total: s.total,
                band: s.band,
              }}
              onPress={() => undefined}
              justSet={i === 0 ? s.mastered - 1 : undefined}
            />
          </View>
        ))}
      </View>
      <PatternBand hue="sky" pattern="star8">
        <Text variant="heading" tone="ink">
          {t('dev.gallery.sample.subject')}
        </Text>
      </PatternBand>
      <PatternBand hue="mint" pattern="hexFlower">
        <Text variant="heading" tone="ink">
          {t('dev.gallery.sample.subject2')}
        </Text>
      </PatternBand>
      <PatternBand hue="coral" pattern="chevron">
        <Text variant="heading" tone="ink">
          {t('dev.gallery.sample.subject3')}
        </Text>
      </PatternBand>
      <MosaicTiles
        total={16}
        mastered={5}
        hue="lilac"
        justSet={4}
        label={t('ui.mosaic.label', {
          subject: t('dev.gallery.sample.subject'),
          count: 5,
          total: 16,
        })}
      />
    </Section>
  );
}

function FeedbackSection() {
  const { t } = useI18n();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  return (
    <Section title={t('dev.gallery.sections.feedback')}>
      <Card>
        <EmptyState
          icon="tasks"
          title={t('student.home.assessments')}
          body={t('student.assessments.empty')}
          action={<Button size="sm" variant="secondary" title={t('student.assessments.retry')} />}
        />
      </Card>
      <Button
        variant="secondary"
        size="sm"
        title={t('dev.gallery.sample.loading')}
        onPress={() => setLoading((l) => !l)}
      />
      {loading ? <SkeletonLines /> : <Text>{t('student.home.placeholder')}</Text>}
      <View style={styles.wrap}>
        <Button
          variant="secondary"
          title={t('dev.gallery.sample.toast')}
          onPress={() => toast(t('dev.gallery.sample.toastBody'), 'success')}
        />
      </View>
      <View style={styles.column}>
        {STATUSES.map((s) => (
          <SyncStatusPill
            key={s}
            status={s}
            pending={s === 'offline' || s === 'error' ? 3 : 0}
            onRetry={() => undefined}
          />
        ))}
      </View>
    </Section>
  );
}

function NavigationSection() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'home' | 'tests' | 'scores' | 'me'>('home');
  const [open, setOpen] = useState(false);
  const items = [
    { key: 'home', label: t('student.home.title'), icon: 'home' },
    { key: 'tests', label: t('student.home.assessments'), icon: 'tasks' },
    { key: 'scores', label: t('student.home.scores'), icon: 'star' },
    { key: 'me', label: t('student.home.attendance'), icon: 'user' },
  ] as const;
  return (
    <Section title={t('dev.gallery.sections.navigation')}>
      <Tabs items={items} value={tab} onChange={setTab} variant="bar" />
      <Tabs items={items} value={tab} onChange={setTab} variant="rail" />
      <Button
        variant="secondary"
        title={t('dev.gallery.sample.sheet')}
        onPress={() => setOpen(true)}
      />
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('dev.gallery.sample.sheetTitle')}
        footer={<Button title={t('console.classes.save')} onPress={() => setOpen(false)} />}
      >
        <Text>{t('dev.gallery.sample.sheetBody')}</Text>
      </Sheet>
    </Section>
  );
}

function LayoutSection() {
  const { t } = useI18n();
  return (
    <Section title={t('dev.gallery.sections.layout')}>
      <Card padded={false} style={styles.twoPane}>
        <TwoPane
          list={
            <View>
              <ListItem title={t('dev.gallery.sample.list')} onPress={() => undefined} />
              <ListItem title={t('student.home.assessments')} onPress={() => undefined} />
            </View>
          }
          detail={
            <View style={styles.pad}>
              <Text variant="heading">{t('dev.gallery.sample.detail')}</Text>
            </View>
          }
        />
      </Card>
    </Section>
  );
}

function MotionSection() {
  const { t } = useI18n();
  const { tier, inExam } = useMotion();
  return (
    <Section title={t('dev.gallery.sections.motion')}>
      <Card>
        {(Object.keys(moments) as MomentName[]).map((name) => {
          const b = resolveMoment(name, tier, { inExam });
          const how =
            b.kind === 'none'
              ? 'none'
              : b.kind === 'spring'
                ? `spring ${b.spring}`
                : b.kind === 'timing'
                  ? `${b.duration} ${b.ease}`
                  : `lottie ${b.asset}`;
          return (
            <Text
              key={name}
              variant="caption"
              script="latin"
              tone={b.kind === 'none' ? 'textMuted' : 'text'}
            >
              {`${name}: ${how} [${behaviourProps(b).join(', ')}]`}
            </Text>
          );
        })}
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  sections: { gap: space.xxl },
  section: { gap: space.md },
  control: { gap: space.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center' },
  column: { gap: space.sm },
  // Gallery-only sizes: a swatch column and a fixed-height box to show TwoPane in.
  swatch: { width: 104, gap: space.xs },
  chip: { height: 40, borderRadius: radius.sm, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  cell: { flexGrow: 1, flexBasis: 260 },
  twoPane: { height: 220 },
  pad: { padding: space.lg },
});
