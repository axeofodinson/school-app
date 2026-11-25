// Staff: hear a question's pre-made read-aloud clips (body.audio) before it goes
// to children. Shown in the question preview; the review queue (prompt 22) reuses it.
import { exactClip } from '@school/core';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Button, Text } from '../../ui';
import { space } from '../../ui/tokens';
import { playClip, stopClip } from './clips';

export function ClipPreview({ body }: { body: unknown }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const en = exactClip(body, 'en');
  const ur = exactClip(body, 'ur');
  useEffect(() => () => stopClip(), []);

  const play = (ref: string) => {
    setFailed(false);
    playClip(ref)
      .then((ok) => setFailed(!ok))
      .catch(() => setFailed(true));
  };

  return (
    <View style={styles.wrap}>
      <Text variant="label">{t('staff.questions.audio.title')}</Text>
      {en || ur ? (
        <View style={styles.row}>
          {en ? (
            <Button
              title={t('staff.questions.audio.playEn')}
              icon="speaker"
              variant="secondary"
              size="sm"
              onPress={() => play(en)}
            />
          ) : null}
          {ur ? (
            <Button
              title={t('staff.questions.audio.playUr')}
              icon="speaker"
              variant="secondary"
              size="sm"
              onPress={() => play(ur)}
            />
          ) : null}
        </View>
      ) : (
        <Text tone="textMuted" variant="bodySm">
          {t('staff.questions.audio.none')}
        </Text>
      )}
      {failed ? (
        <Text tone="wrong" variant="bodySm" accessibilityLiveRegion="polite">
          {t('staff.questions.audio.failed')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
