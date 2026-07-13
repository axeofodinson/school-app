// Battery-optimization helper — detection + opening the right Settings screen.
//
// Some Android OEMs (Xiaomi/MIUI, Oppo/ColorOS, Vivo/FuntouchOS, Huawei/EMUI)
// aggressively kill backgrounded apps, which silently swallows push
// notifications. There's no API to disable that; the best we can do is detect
// those brands and walk the user to the Settings screen where they can whitelist
// the app. This module holds the "which brand" check and the "open Settings"
// action; the one-time prompt UI lives in BatteryOptimizationPrompt.js.
import { Platform, Linking } from 'react-native';
import * as Device from 'expo-device';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';

// The Android package id, for the app-details Settings intent. expo-application
// isn't a dependency, so read it from expo-constants' bundled config instead.
const ANDROID_PACKAGE =
  Constants?.expoConfig?.android?.package ??
  Constants?.manifest?.android?.package ??
  null;

// Brands known to need the nudge, plus the sub-brands that ship the same OEM
// skin (Redmi/POCO = Xiaomi/MIUI, realme/OnePlus = Oppo/ColorOS lineage, iQOO =
// Vivo, Honor = ex-Huawei/EMUI). Matched case-insensitively against both
// manufacturer and brand, since OEMs report these inconsistently.
const AGGRESSIVE_OEMS = [
  'xiaomi', 'redmi', 'poco',
  'oppo', 'realme', 'oneplus',
  'vivo', 'iqoo',
  'huawei', 'honor',
];

// True when the current device is an Android phone from a brand that needs the
// battery-optimization whitelist to reliably receive push.
export function needsBatteryOptimizationHelp() {
  if (Platform.OS !== 'android') return false;
  const haystack = `${Device.manufacturer ?? ''} ${Device.brand ?? ''}`.toLowerCase();
  return AGGRESSIVE_OEMS.some((oem) => haystack.includes(oem));
}

// Open the most relevant Settings screen so the user can exempt the app from
// battery optimization. Tries, in order:
//   1. the system "ignore battery optimizations" list (most direct),
//   2. this app's own details page (where "Battery" lives on most skins),
//   3. Linking.openSettings() as a last resort.
// Never throws — a device without a given Settings intent just falls through.
export async function openBatterySettings() {
  if (Platform.OS !== 'android') {
    try {
      await Linking.openSettings();
    } catch {
      // Nothing more we can do.
    }
    return;
  }

  // 1. The battery-optimization list.
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
    );
    return;
  } catch {
    // Not available on this OS version / skin — fall through.
  }

  // 2. This app's details page (Settings → Apps → School App), where the
  //    per-app Battery control lives on most OEM skins.
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
      ANDROID_PACKAGE ? { data: `package:${ANDROID_PACKAGE}` } : undefined
    );
    return;
  } catch {
    // Fall through to the generic settings opener.
  }

  // 3. Generic fallback.
  try {
    await Linking.openSettings();
  } catch {
    // Give up silently — the prompt copy still tells them where to look.
  }
}
