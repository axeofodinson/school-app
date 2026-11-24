// Scans a student's QR card and hands back the admission number (never a PIN:
// the card has none). Android: the device camera. Web: the webcam, but only where
// the browser has a native BarcodeDetector (Chrome on ChromeOS / Android). We do
// not fall back to expo-camera's polyfill on web, because it downloads its WASM
// from a CDN, which the school network may block (CLAUDE.md: no CDN). Everyone
// else types the admission number.
import { parseStudentQr } from '@school/core';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Button, EmptyState, Text } from '../../ui';

function webScanningAvailable(): boolean {
  return (
    Platform.OS !== 'web' ||
    (typeof globalThis !== 'undefined' &&
      'BarcodeDetector' in globalThis &&
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia))
  );
}

export function QrScanner({
  onAdmissionNo,
  onTypeInstead,
}: {
  onAdmissionNo: (admissionNo: string) => void;
  onTypeInstead: () => void;
}) {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  // Web without a native BarcodeDetector: no scanning (decided up front).
  const [available, setAvailable] = useState<boolean | null>(() =>
    webScanningAvailable() ? null : false,
  );
  const [notOurs, setNotOurs] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    let alive = true;
    if (!webScanningAvailable()) return;
    CameraView.isAvailableAsync()
      .then((ok) => alive && setAvailable(ok))
      .catch(() => alive && setAvailable(false));
    return () => {
      alive = false;
    };
  }, []);

  const onScan = ({ data }: BarcodeScanningResult) => {
    if (done.current) return;
    const code = parseStudentQr(data);
    if (!code) {
      setNotOurs(true);
      return;
    }
    done.current = true;
    onAdmissionNo(code);
  };

  const typeInstead = (
    <Button title={t('auth.scan.typeInstead')} variant="secondary" onPress={onTypeInstead} />
  );

  if (available === null || !permission) {
    return <Text tone="textMuted">{t('common.loading')}</Text>;
  }
  if (!available) {
    return <EmptyState icon="info" title={t('auth.scan.noCamera')} action={typeInstead} />;
  }
  if (!permission.granted) {
    return (
      <EmptyState
        icon="eye"
        title={t('auth.scan.permissionTitle')}
        body={t('auth.scan.permissionBody')}
        action={
          <View style={styles.actions}>
            {permission.canAskAgain ? (
              <Button title={t('auth.scan.allow')} onPress={requestPermission} />
            ) : null}
            {typeInstead}
          </View>
        }
      />
    );
  }
  return (
    <View style={styles.wrap}>
      <View style={styles.cameraBox}>
        <CameraView
          style={styles.camera}
          facing={Platform.OS === 'web' ? 'front' : 'back'}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScan}
        />
      </View>
      <Text accessibilityLiveRegion="polite">
        {notOurs ? t('auth.scan.notOurCard') : t('auth.scan.hint')}
      </Text>
      {typeInstead}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  actions: { gap: 8 },
  cameraBox: {
    width: '100%',
    maxWidth: 420,
    aspectRatio: 1,
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 16,
  },
  camera: { flex: 1 },
});
