// Quest theme — the student app's visual identity. Warm parchment + grass
// green + treasure gold, chunky 2px outlines, and hard "pressed-down" edges:
// pixel-adventure-game warmth (think handheld Zelda), tuned for kids.
//
// Scope: STUDENT surfaces only. The console/teacher screens keep the plain
// theme in ./colors.js — never import this file from a console screen.
// Everything here is flat colour + solid borders (no gradients, no blur
// shadows), so it costs nothing extra on low-end Android.
import { isRTL } from '../i18n';
import { fonts } from './fonts';

export { spacing } from './colors';

export const quest = {
  // Parchment world
  bg: '#fbf0d9', // screen background
  bgDeep: '#f1e0bd', // wells, bar tracks, pressed surfaces
  surface: '#fff9ec', // card faces
  ink: '#4a3222', // primary text — warm dark brown (matches sprite outlines)
  faint: '#8a6f52', // secondary text
  outline: '#5c3d24', // card + button outlines
  cream: '#fff9ec', // text on saturated faces

  // Accents (each with a darker "edge" for the 3D underside + pressed states)
  green: '#55a049',
  greenEdge: '#33702f',
  gold: '#f2a93b',
  goldEdge: '#b57718',
  sky: '#4fa7d9',
  skyEdge: '#2f6f96',
  berry: '#e0607e',
  berryEdge: '#a83d56',
  purple: '#8e6fc8',
  purpleEdge: '#63488f',
  red: '#d64545',
  redEdge: '#992e2e',

  // Soft tints for banners/badges (parchment-compatible pastels)
  greenTint: '#e3efd8',
  goldTint: '#faeacb',
  skyTint: '#ddedf7',
  redTint: '#f8dfd8',
};

// Pixel-construction constants: chunky border, blocky corners, and the height
// of the hard bottom edge that makes panels/buttons look pressable.
export const px = {
  border: 2,
  radius: 8,
  edge: 4,
};

// Display face for titles, buttons, and big numbers. English gets the bundled
// pixel font (Pixelify Sans); Urdu keeps Noto Nastaliq Bold — Nastaliq IS the
// warmth in Urdu, and a Latin pixel font can't render it.
export function displayFont() {
  return isRTL ? fonts.urdu.bold : 'PixelifySans-SemiBold';
}

// Style fragment for display text. The pixel font must not be fake-bolded
// (Android synthesises an ugly smear), so weight stays normal in English.
// Nastaliq needs generous line-height or its ascenders/descenders clip.
export function displayText(fontSize) {
  return {
    fontFamily: displayFont(),
    fontWeight: '400',
    fontSize,
    lineHeight: isRTL ? Math.round(fontSize * 1.9) : Math.round(fontSize * 1.25),
  };
}
