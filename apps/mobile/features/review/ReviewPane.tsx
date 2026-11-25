// One question, both languages side by side (wireframe 7.9), with the two
// checks, the scopes and the four decisions. The card glides in from the side
// the teacher is moving toward (`reviewAdvance`, mirrored in RTL); lite fades,
// off is instant.
import {
  REVIEW_SCOPES,
  approveBlock,
  reviewView,
  urduGaps,
  type ApproveBlock,
  type BiText as Bi,
  type ReviewItem,
  type ReviewScope,
} from '@school/core';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';

import { useI18n, type TKey } from '../../i18n';
import { Badge, Button, Card, Icon, Text, useTheme } from '../../ui';
import { useEnterStyle } from '../../ui/motion';
import { useFocusRing } from '../../ui/Sticker';
import { radius, space, strokeWidth } from '../../ui/tokens';
import { CheckRow } from '../curriculum/CheckRow';
import { ClipPreview } from '../prereader/ClipPreview';
import { useQuestionMeta } from '../questions/QuestionPreview';
import { MathText } from './MathText';

export function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 4).toUpperCase();
}

const BLOCK_KEYS: Record<Exclude<ApproveBlock, null>, TKey> = {
  cantReview: 'staff.review.pane.blocked.cantReview',
  retired: 'staff.review.pane.blocked.retired',
  noConcept: 'staff.review.pane.blocked.noConcept',
  noScopes: 'staff.review.pane.blocked.noScopes',
  answerUnchecked: 'staff.review.pane.blocked.answerUnchecked',
};

export interface PaneState {
  scopes: ReviewScope[];
  answerChecked: boolean;
  urduOk: boolean;
}

export function ReviewPane({
  item,
  conceptName,
  direction,
  state,
  onState,
  onApprove,
  onEdit,
  onChanges,
  onReject,
  busy,
  isStaff,
  onBack,
}: {
  item: ReviewItem;
  conceptName: string;
  /** Which way the teacher moved: the card comes in from that side. */
  direction: 1 | -1;
  state: PaneState;
  onState: (s: PaneState) => void;
  onApprove: () => void;
  onEdit: () => void;
  onChanges: () => void;
  onReject: () => void;
  busy: boolean;
  isStaff: boolean;
  /** Narrow windows: back to the list. */
  onBack?: () => void;
}) {
  const { t } = useI18n();
  const meta = useQuestionMeta()(item);
  const enter = useEnterStyle('reviewAdvance', true, { translateX: 24 * direction });
  const [wide, setWide] = useState(false);
  const v = reviewView(item);
  const gaps = urduGaps(v);
  const block = approveBlock(item, state);
  const decided = item.status === 'retired';
  const canDecide = item.can_review && !decided;
  const editable = (item.can_review || (isStaff && !item.concept_id)) && !decided && !item.in_use;

  const gapList = [
    gaps.stem ? t('staff.review.pane.gapStem') : null,
    gaps.options ? t('staff.review.pane.gapOptions', { n: gaps.options }) : null,
    gaps.explanation ? t('staff.review.pane.gapExplanation') : null,
  ].filter(Boolean);

  const correctLabel =
    item.type === 'true_false'
      ? v.correct === 'true'
        ? t('staff.review.pane.true')
        : v.correct === 'false'
          ? t('staff.review.pane.false')
          : null
      : item.type === 'mcq'
        ? null
        : v.correct;

  return (
    <Animated.View
      style={[styles.wrap, enter]}
      onLayout={(e: LayoutChangeEvent) => setWide(e.nativeEvent.layout.width >= 480)}
    >
      {onBack ? (
        <Button
          title={t('staff.review.pane.back')}
          icon="back"
          variant="ghost"
          size="sm"
          onPress={onBack}
          style={styles.start}
        />
      ) : null}
      <View style={styles.head}>
        <View style={styles.headRow}>
          <Text variant="heading" accessibilityRole="header" script="latin">
            {t('staff.review.qid', { id: shortId(item.id) })}
          </Text>
          <Badge
            label={t(`staff.review.origin.${item.origin}`)}
            tone={item.origin === 'human' ? 'neutral' : 'accent'}
            icon={item.origin === 'human' ? 'user' : 'sparkles'}
          />
          <Badge label={t('staff.review.pane.version', { v: item.version })} />
          {item.in_use ? (
            <Badge label={t('staff.review.badges.inUse')} icon="lock" tone="weak" />
          ) : null}
        </View>
        <Text tone="textMuted">
          {t('staff.review.pane.meta', {
            concept: conceptName,
            level: meta.level,
            difficulty: item.difficulty,
          })}
          {' · '}
          {meta.type}
        </Text>
        {v.source && v.source.book ? (
          <Text variant="bodySm" tone="textMuted">
            {v.source.page
              ? t('staff.review.pane.source', { book: v.source.book, page: v.source.page })
              : t('staff.review.pane.sourceNoPage', { book: v.source.book })}
          </Text>
        ) : null}
      </View>

      {notice(item, isStaff, t)}

      <View style={[styles.columns, wide && styles.columnsWide]}>
        <LangColumn
          label={t('staff.review.pane.english')}
          pick={(b) => b.en}
          v={v}
          correct={item.type === 'mcq' ? v.correct : null}
          wide={wide}
        />
        <LangColumn
          label={t('staff.review.pane.urdu')}
          pick={(b) => b.ur}
          v={v}
          correct={item.type === 'mcq' ? v.correct : null}
          wide={wide}
          rtl
        />
      </View>

      {correctLabel !== null ? (
        <View style={styles.answerRow}>
          <Icon name="checkCircle" size={20} tone="correct" />
          <Text variant="label">
            {t('staff.review.pane.answerIs', { value: correctLabel ?? '—' })}
          </Text>
          {v.also.length ? (
            <Text tone="textMuted">{t('staff.review.pane.also', { list: v.also.join(', ') })}</Text>
          ) : null}
        </View>
      ) : null}

      {v.hasAudio ? (
        <View style={styles.section}>
          <Text variant="label">{t('staff.review.pane.audio')}</Text>
          <ClipPreview body={item.body} />
        </View>
      ) : null}

      <Card style={styles.decide}>
        <Text variant="label">{t('staff.review.pane.checks')}</Text>
        <CheckRow
          label={t('staff.review.pane.checkAnswer')}
          checked={state.answerChecked}
          disabled={!canDecide}
          onToggle={() => onState({ ...state, answerChecked: !state.answerChecked })}
        />
        <CheckRow
          label={t('staff.review.pane.checkUrdu')}
          detail={
            gapList.length
              ? t('staff.review.pane.urduGaps', { list: gapList.join(', ') })
              : undefined
          }
          checked={state.urduOk}
          disabled={!canDecide}
          onToggle={() => onState({ ...state, urduOk: !state.urduOk })}
        />
        <View style={styles.scopeHead}>
          <Text variant="label">{t('staff.review.pane.scopes')}</Text>
          <Text variant="bodySm" tone="textMuted">
            {t('staff.review.pane.scopesHint')}
          </Text>
        </View>
        <View style={styles.scopes} accessibilityRole="none">
          {REVIEW_SCOPES.map((s, i) => (
            <ScopeChip
              key={s}
              n={i + 1}
              label={t(`staff.review.scope.${s}`)}
              on={state.scopes.includes(s)}
              live={item.scopes.includes(s)}
              disabled={!canDecide}
              onPress={() =>
                onState({
                  ...state,
                  scopes: state.scopes.includes(s)
                    ? state.scopes.filter((x) => x !== s)
                    : REVIEW_SCOPES.filter((x) => x === s || state.scopes.includes(x)),
                })
              }
            />
          ))}
        </View>
        <View style={styles.actions}>
          <Button
            title={t('staff.review.pane.reject')}
            variant="ghost"
            size="sm"
            icon="close"
            disabled={!canDecide || busy}
            onPress={onReject}
          />
          <Button
            title={t('staff.review.pane.changes')}
            variant="ghost"
            size="sm"
            icon="pencil"
            disabled={!canDecide || busy}
            onPress={onChanges}
          />
          <Button
            title={t('staff.review.pane.edit')}
            variant="secondary"
            size="sm"
            icon="pencil"
            disabled={!editable || busy}
            onPress={onEdit}
          />
          <View style={styles.grow} />
          <Button
            title={t('staff.review.pane.approve')}
            icon="check"
            disabled={block !== null || busy}
            loading={busy}
            onPress={onApprove}
          />
        </View>
        {block && canDecide ? (
          <Text variant="bodySm" tone="textMuted" style={styles.blockNote}>
            {t(BLOCK_KEYS[block])}
          </Text>
        ) : null}
      </Card>
    </Animated.View>
  );
}

function notice(item: ReviewItem, isStaff: boolean, t: ReturnType<typeof useI18n>['t']): ReactNode {
  const scopes = item.scopes.map((s) => t(`staff.review.scope.${s as ReviewScope}`)).join(', ');
  if (item.status === 'retired') {
    return (
      <Banner
        icon="archive"
        tone="wrong"
        text={t('staff.review.pane.retired', { notes: item.last_notes ?? '—' })}
      />
    );
  }
  if (!item.concept_id) {
    return (
      <Banner
        icon="warning"
        tone="weak"
        text={t(isStaff ? 'staff.review.pane.noConceptStaff' : 'staff.review.pane.noConcept')}
      />
    );
  }
  if (!item.can_review) {
    return <Banner icon="lock" tone="neutral" text={t('staff.review.pane.notYours')} />;
  }
  if (item.last_decision === 'request_changes' && item.last_notes) {
    return (
      <Banner
        icon="pencil"
        tone="weak"
        text={t('staff.review.pane.lastChanges', { notes: item.last_notes })}
      />
    );
  }
  if (item.status === 'approved' && scopes) {
    return (
      <Banner
        icon="checkCircle"
        tone="correct"
        text={t('staff.review.pane.lastApproved', { scopes })}
      />
    );
  }
  if (item.in_use) {
    return <Banner icon="lock" tone="neutral" text={t('staff.review.pane.inUse')} />;
  }
  return null;
}

function Banner({
  icon,
  tone,
  text,
}: {
  icon: 'archive' | 'warning' | 'lock' | 'pencil' | 'checkCircle';
  tone: 'wrong' | 'weak' | 'neutral' | 'correct';
  text: string;
}) {
  const { colours } = useTheme();
  const bg = tone === 'neutral' ? colours.surfaceAlt : colours[`${tone}Soft`];
  const fg = (
    {
      neutral: 'textMuted',
      wrong: 'onWrongSoft',
      weak: 'onWeakSoft',
      correct: 'onCorrectSoft',
    } as const
  )[tone];
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert">
      <Icon name={icon} size={20} tone={fg} />
      <Text tone={fg} style={styles.grow}>
        {text}
      </Text>
    </View>
  );
}

function LangColumn({
  label,
  pick,
  v,
  correct,
  rtl,
  wide,
}: {
  label: string;
  pick: (b: Bi) => string;
  v: ReturnType<typeof reviewView>;
  correct: string | null;
  rtl?: boolean;
  wide: boolean;
}) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const missing = (
    <Text tone="weak" variant="bodySm">
      {t('staff.review.pane.missing')}
    </Text>
  );
  const show = (b: Bi, variant: 'body' | 'bodySm' = 'body') =>
    pick(b).trim() ? <MathText text={pick(b)} variant={variant} /> : missing;
  return (
    <View
      style={[
        styles.col,
        wide && styles.colWide,
        { borderColor: colours.border, direction: rtl ? 'rtl' : 'ltr' },
      ]}
      accessibilityLabel={label}
    >
      <Text variant="caption" tone="primary">
        {label}
      </Text>
      {show(v.stem)}
      {v.options.length ? (
        <View style={styles.options}>
          {v.options.map((o) => {
            const right = correct !== null && o.key === correct;
            return (
              <View
                key={o.key}
                style={[
                  styles.option,
                  {
                    borderColor: right ? colours.correct : colours.border,
                    backgroundColor: right ? colours.correctSoft : 'transparent',
                  },
                ]}
              >
                <View
                  style={[
                    styles.key,
                    { backgroundColor: right ? colours.correct : colours.surfaceAlt },
                  ]}
                >
                  <Text variant="label" tone={right ? 'onPrimary' : 'textMuted'} script="latin">
                    {o.key}
                  </Text>
                </View>
                <View style={styles.grow}>{show(o.text, 'bodySm')}</View>
                {right ? (
                  <View style={styles.answerTag}>
                    <Icon name="check" size={16} tone="onCorrectSoft" />
                    <Text variant="bodySm" tone="onCorrectSoft">
                      {t('staff.review.pane.answer')}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {pick(v.explanation).trim() || v.explanation.en || v.explanation.ur ? (
        <View style={styles.section}>
          <Text variant="label" tone="textMuted">
            {t('staff.review.pane.explanation')}
          </Text>
          {show(v.explanation, 'bodySm')}
        </View>
      ) : null}
      {v.whyWrong.map((w) =>
        pick(w.text).trim() ? (
          <View key={w.key} style={styles.section}>
            <Text variant="label" tone="textMuted">
              {t('staff.review.pane.whyWrong', { key: w.key })}
            </Text>
            {show(w.text, 'bodySm')}
          </View>
        ) : null,
      )}
    </View>
  );
}

function ScopeChip({
  n,
  label,
  on,
  live,
  disabled,
  onPress,
}: {
  n: number;
  label: string;
  on: boolean;
  live: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colours, p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const pop = useEnterStyle('selectionChange', on, {});
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        {
          minHeight: p.minTarget,
          borderColor: on ? colours.primary : colours.borderStrong,
          backgroundColor: on ? colours.primarySoft : colours.surface,
          opacity: disabled ? 0.55 : 1,
        },
        ring,
      ]}
    >
      <Text variant="bodySm" tone="textMuted" script="latin">
        {n}
      </Text>
      <Animated.View style={pop}>
        <Icon name="check" size={16} tone={on ? 'onPrimarySoft' : 'textMuted'} />
      </Animated.View>
      <Text tone={on ? 'onPrimarySoft' : 'text'}>{label}</Text>
      {live ? <View style={[styles.liveDot, { backgroundColor: colours.correct }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, paddingBottom: space.xl },
  start: { alignSelf: 'flex-start' },
  head: { gap: space.xxs },
  headRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  columns: { gap: space.md },
  columnsWide: { flexDirection: 'row', alignItems: 'stretch' },
  colWide: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  col: {
    gap: space.sm,
    padding: space.md,
    borderWidth: strokeWidth.hairline,
    borderRadius: radius.md,
  },
  options: { gap: space.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.xs,
    borderWidth: strokeWidth.hairline,
    borderRadius: radius.sm,
  },
  key: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerTag: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  answerRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  section: { gap: space.xxs },
  decide: { gap: space.sm },
  scopeHead: { gap: space.xxs, marginTop: space.xs },
  scopes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderWidth: strokeWidth.control,
    borderRadius: radius.full,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.sm,
  },
  blockNote: { alignSelf: 'flex-end' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
  },
  grow: { flex: 1 },
});
