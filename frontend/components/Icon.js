/**
 * Icon.js — shared teal thin-line icon set, replacing raw emoji glyphs
 * across the app. Each icon is a small set of stroke-only SVG primitives
 * (no fills) drawn on a 100x100 viewBox, sized/colored via props so one
 * definition works everywhere an emoji used to be dropped into a <Text>.
 *
 * Usage: <Icon name="bedroom" size={36} color={Colors.icon} />
 *
 * Room-type icons (bedroom, living_room, bathroom, toilet, kitchen,
 * dining_room, office, baby_room, wardrobe) match the reference icon
 * sheet's set of rooms; everything else here fills in the app's other
 * emoji call sites in the same style/color family.
 */

import React from 'react';
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg';
import Colors from '../constants/Colors';

const COMMON = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };

const ICONS = {
  // ---- Room types (match the reference icon sheet) ----
  bedroom: ({ c, w }) => (
    <>
      <Rect x="10" y="55" width="70" height="28" rx="6" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M10 68 H80" {...COMMON} stroke={c} strokeWidth={w} />
      <Rect x="16" y="46" width="20" height="14" rx="5" {...COMMON} stroke={c} strokeWidth={w} />
      <Rect x="40" y="46" width="20" height="14" rx="5" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M10 55 V38 H30 V55" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="87" y1="83" x2="87" y2="40" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Path d="M87 40 L96 52 H78 Z" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  living_room: ({ c, w }) => (
    <>
      <Path d="M14 58 V44 Q14 38 20 38 H62 Q68 38 68 44 V58" {...COMMON} stroke={c} strokeWidth={w} />
      <Rect x="8" y="58" width="66" height="18" rx="6" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M8 68 H0 M74 68 H82" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Line x1="8" y1="76" x2="8" y2="84" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Line x1="74" y1="76" x2="74" y2="84" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Path d="M88 84 L84 66 H96 L92 84 Z" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M88 66 V50 M88 50 Q80 46 82 38 M88 50 Q96 46 94 38" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  bathroom: ({ c, w }) => (
    <>
      <Path d="M22 30 Q22 20 32 20 Q42 20 42 30" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="32" y1="30" x2="32" y2="38" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Path d="M20 40 H44 M24 46 H40 M28 52 H36" stroke={c} strokeWidth={w * 0.8} strokeLinecap="round" />
      <Path d="M10 84 V64 Q10 58 16 58 H84 Q90 58 90 64 V84" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M10 84 H90" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Path d="M70 58 V50 Q70 46 74 46 Q78 46 78 50" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  toilet: ({ c, w }) => (
    <>
      <Rect x="30" y="16" width="34" height="16" rx="3" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M30 32 H64 V40 H30 Z" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M26 40 H68 Q72 40 72 46 Q72 66 47 66 Q22 66 22 46 Q22 40 26 40 Z" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M32 66 L28 84 M62 66 L66 84" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Circle cx="14" cy="26" r="9" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  kitchen: ({ c, w }) => (
    <>
      <Rect x="10" y="14" width="30" height="70" rx="4" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="10" y1="38" x2="40" y2="38" stroke={c} strokeWidth={w} />
      <Line x1="30" y1="22" x2="30" y2="30" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Line x1="30" y1="46" x2="30" y2="54" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Rect x="50" y="30" width="40" height="54" rx="4" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="50" y1="66" x2="90" y2="66" stroke={c} strokeWidth={w} />
      <Circle cx="60" cy="40" r="5" {...COMMON} stroke={c} strokeWidth={w} />
      <Circle cx="80" cy="40" r="5" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="70" y1="76" x2="70" y2="76" stroke={c} strokeWidth={w} strokeLinecap="round" />
    </>
  ),
  dining_room: ({ c, w }) => (
    <>
      <Line x1="10" y1="50" x2="90" y2="50" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Line x1="16" y1="50" x2="16" y2="66" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Line x1="84" y1="50" x2="84" y2="66" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Path d="M20 66 L14 84 M12 66 L18 84 M12 66 H20" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M80 66 L74 84 M78 66 L86 84 M78 66 H86" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M48 50 V38 Q48 34 52 34 Q56 34 56 38 V50" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="52" y1="26" x2="52" y2="34" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Circle cx="52" cy="22" r="4" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  office: ({ c, w }) => (
    <>
      <Rect x="26" y="18" width="34" height="24" rx="3" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="43" y1="42" x2="43" y2="50" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Line x1="33" y1="50" x2="53" y2="50" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Path d="M8 62 H86" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Path d="M14 62 V82 M80 62 V82" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Rect x="66" y="46" width="14" height="16" rx="2" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="66" y1="52" x2="80" y2="52" stroke={c} strokeWidth={w * 0.8} />
    </>
  ),
  baby_room: ({ c, w }) => (
    <>
      <Rect x="14" y="40" width="60" height="30" rx="6" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="24" y1="40" x2="24" y2="70" stroke={c} strokeWidth={w * 0.7} />
      <Line x1="34" y1="40" x2="34" y2="70" stroke={c} strokeWidth={w * 0.7} />
      <Line x1="44" y1="40" x2="44" y2="70" stroke={c} strokeWidth={w * 0.7} />
      <Line x1="54" y1="40" x2="54" y2="70" stroke={c} strokeWidth={w * 0.7} />
      <Line x1="64" y1="40" x2="64" y2="70" stroke={c} strokeWidth={w * 0.7} />
      <Path d="M14 70 L10 84 M74 70 L78 84" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Path d="M44 40 V16" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Path d="M44 16 Q54 16 54 24" {...COMMON} stroke={c} strokeWidth={w} />
      <Circle cx="56" cy="26" r="4" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M44 16 Q34 20 34 28" {...COMMON} stroke={c} strokeWidth={w} />
      <Circle cx="33" cy="30" r="4" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  wardrobe: ({ c, w }) => (
    <>
      <Rect x="14" y="12" width="72" height="76" rx="4" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="50" y1="12" x2="50" y2="88" stroke={c} strokeWidth={w} />
      <Line x1="70" y1="12" x2="70" y2="88" stroke={c} strokeWidth={w} />
      <Line x1="44" y1="48" x2="44" y2="56" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Line x1="56" y1="48" x2="56" y2="56" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Line x1="74" y1="34" x2="82" y2="34" stroke={c} strokeWidth={w * 0.8} strokeLinecap="round" />
      <Line x1="74" y1="52" x2="82" y2="52" stroke={c} strokeWidth={w * 0.8} strokeLinecap="round" />
      <Line x1="74" y1="70" x2="82" y2="70" stroke={c} strokeWidth={w * 0.8} strokeLinecap="round" />
    </>
  ),
  garage: ({ c, w }) => (
    <>
      <Path d="M8 40 L50 14 L92 40" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M12 36 V86 H88 V36" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M12 50 H88 M20 50 V86 M35 50 V86 M50 50 V86 M65 50 V86 M80 50 V86" stroke={c} strokeWidth={w * 0.8} strokeLinecap="round" />
    </>
  ),
  storage_room: ({ c, w }) => (
    <>
      <Rect x="14" y="46" width="34" height="34" rx="3" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M14 63 H48 M31 46 V80" stroke={c} strokeWidth={w * 0.8} />
      <Rect x="52" y="30" width="34" height="50" rx="3" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M52 55 H86 M69 30 V80" stroke={c} strokeWidth={w * 0.8} />
    </>
  ),
  custom: ({ c, w }) => (
    <>
      <Path d="M14 46 L50 16 L86 46" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M24 40 V84 H76 V40" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M50 54 V74 M40 64 H60" stroke={c} strokeWidth={w} strokeLinecap="round" />
    </>
  ),

  // ---- Misc app icons (in the same stroke-only teal style) ----
  home: ({ c, w }) => (
    <>
      <Path d="M14 46 L50 16 L86 46" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M24 40 V84 H76 V40" {...COMMON} stroke={c} strokeWidth={w} />
      <Rect x="42" y="58" width="16" height="26" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  folder: ({ c, w }) => (
    <Path d="M10 26 H38 L46 36 H90 V78 H10 Z" {...COMMON} stroke={c} strokeWidth={w} />
  ),
  ruler: ({ c, w }) => (
    <>
      <Rect x="10" y="40" width="80" height="20" rx="3" transform="rotate(-20 50 50)" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M28 42 L32 50 M40 38 L44 46 M52 34 L56 42 M64 30 L68 38" stroke={c} strokeWidth={w * 0.8} strokeLinecap="round" />
    </>
  ),
  camera: ({ c, w }) => (
    <>
      <Path d="M10 34 H32 L38 24 H62 L68 34 H90 V80 H10 Z" {...COMMON} stroke={c} strokeWidth={w} />
      <Circle cx="50" cy="58" r="16" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  robot: ({ c, w }) => (
    <>
      <Rect x="24" y="34" width="52" height="42" rx="10" {...COMMON} stroke={c} strokeWidth={w} />
      <Circle cx="40" cy="54" r="5" {...COMMON} stroke={c} strokeWidth={w} />
      <Circle cx="60" cy="54" r="5" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M38 68 H62" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Line x1="50" y1="34" x2="50" y2="18" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Circle cx="50" cy="14" r="4" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="10" y1="48" x2="24" y2="48" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Line x1="76" y1="48" x2="90" y2="48" stroke={c} strokeWidth={w} strokeLinecap="round" />
    </>
  ),
  sparkle: ({ c, w }) => (
    <>
      <Path d="M50 10 L58 42 L90 50 L58 58 L50 90 L42 58 L10 50 L42 42 Z" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  clipboard: ({ c, w }) => (
    <>
      <Rect x="20" y="18" width="60" height="72" rx="6" {...COMMON} stroke={c} strokeWidth={w} />
      <Rect x="38" y="10" width="24" height="14" rx="4" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="32" y1="42" x2="68" y2="42" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Line x1="32" y1="56" x2="68" y2="56" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Line x1="32" y1="70" x2="56" y2="70" stroke={c} strokeWidth={w} strokeLinecap="round" />
    </>
  ),
  lock: ({ c, w }) => (
    <>
      <Rect x="22" y="46" width="56" height="42" rx="8" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M32 46 V32 Q32 14 50 14 Q68 14 68 32 V46" {...COMMON} stroke={c} strokeWidth={w} />
      <Circle cx="50" cy="64" r="6" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="50" y1="70" x2="50" y2="78" stroke={c} strokeWidth={w} strokeLinecap="round" />
    </>
  ),
  gallery: ({ c, w }) => (
    <>
      <Rect x="10" y="16" width="80" height="68" rx="6" {...COMMON} stroke={c} strokeWidth={w} />
      <Circle cx="30" cy="36" r="8" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M10 74 L36 50 L54 66 L68 52 L90 72" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  search: ({ c, w }) => (
    <>
      <Circle cx="44" cy="44" r="26" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="63" y1="63" x2="88" y2="88" stroke={c} strokeWidth={w} strokeLinecap="round" />
    </>
  ),
  check: ({ c, w }) => (
    <Path d="M18 52 L40 74 L84 26" {...COMMON} stroke={c} strokeWidth={w} />
  ),
  close: ({ c, w }) => (
    <Path d="M22 22 L78 78 M78 22 L22 78" stroke={c} strokeWidth={w} strokeLinecap="round" />
  ),
  trash: ({ c, w }) => (
    <>
      <Path d="M18 26 H82" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Path d="M36 26 V16 H64 V26" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M26 26 L32 88 H68 L74 26" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="42" y1="40" x2="44" y2="74" stroke={c} strokeWidth={w * 0.8} strokeLinecap="round" />
      <Line x1="58" y1="40" x2="56" y2="74" stroke={c} strokeWidth={w * 0.8} strokeLinecap="round" />
    </>
  ),
  target: ({ c, w }) => (
    <>
      <Circle cx="50" cy="50" r="38" {...COMMON} stroke={c} strokeWidth={w} />
      <Circle cx="50" cy="50" r="22" {...COMMON} stroke={c} strokeWidth={w} />
      <Circle cx="50" cy="50" r="6" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  chat: ({ c, w }) => (
    <Path d="M12 20 H88 V66 H40 L22 84 V66 H12 Z" {...COMMON} stroke={c} strokeWidth={w} />
  ),
  mail: ({ c, w }) => (
    <>
      <Rect x="10" y="24" width="80" height="52" rx="6" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M12 28 L50 56 L88 28" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  bag: ({ c, w }) => (
    <>
      <Path d="M22 34 H78 L74 88 H26 Z" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M34 34 V24 Q34 12 50 12 Q66 12 66 24 V34" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  pencil: ({ c, w }) => (
    <>
      <Path d="M20 80 L24 62 L66 20 L80 34 L38 76 Z" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="56" y1="30" x2="70" y2="44" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Path d="M20 80 L38 76 L24 62 Z" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  plus: ({ c, w }) => (
    <Path d="M50 16 V84 M16 50 H84" stroke={c} strokeWidth={w} strokeLinecap="round" />
  ),
  box: ({ c, w }) => (
    <>
      <Path d="M12 32 L50 14 L88 32 L50 50 Z" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M12 32 V72 L50 90 V50" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M88 32 V72 L50 90" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  scan: ({ c, w }) => (
    <>
      <Path d="M16 30 V18 H28" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M72 18 H84 V30" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M16 70 V82 H28" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M72 82 H84 V70" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Line x1="16" y1="50" x2="84" y2="50" stroke={c} strokeWidth={w} strokeLinecap="round" />
    </>
  ),
  sad: ({ c, w }) => (
    <>
      <Circle cx="50" cy="50" r="38" {...COMMON} stroke={c} strokeWidth={w} />
      <Circle cx="38" cy="42" r="4" fill={c} />
      <Circle cx="62" cy="42" r="4" fill={c} />
      <Path d="M34 68 Q50 54 66 68" {...COMMON} stroke={c} strokeWidth={w} />
    </>
  ),
  question: ({ c, w }) => (
    <>
      <Circle cx="50" cy="50" r="38" {...COMMON} stroke={c} strokeWidth={w} />
      <Path d="M38 40 Q38 28 50 28 Q62 28 62 40 Q62 48 52 52 V60" {...COMMON} stroke={c} strokeWidth={w} />
      <Circle cx="50" cy="72" r="1.5" fill={c} stroke={c} strokeWidth={w * 0.6} />
    </>
  ),
  party: ({ c, w }) => (
    <>
      <Path d="M22 88 L38 34 L78 60 Z" {...COMMON} stroke={c} strokeWidth={w} />
      <Circle cx="70" cy="20" r="4" {...COMMON} stroke={c} strokeWidth={w} />
      <Line x1="84" y1="34" x2="90" y2="30" stroke={c} strokeWidth={w} strokeLinecap="round" />
      <Line x1="80" y1="16" x2="84" y2="10" stroke={c} strokeWidth={w} strokeLinecap="round" />
    </>
  ),
  checkboxEmpty: ({ c, w }) => (
    <Rect x="16" y="16" width="68" height="68" rx="12" {...COMMON} stroke={c} strokeWidth={w} />
  ),
  checkboxChecked: ({ c, w }) => (
    <>
      <Rect x="16" y="16" width="68" height="68" rx="12" fill={c} stroke={c} strokeWidth={w} />
      <Path d="M30 52 L44 66 L72 34" fill="none" stroke={Colors.white} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export default function Icon({ name, size = 24, color = Colors.icon, strokeWidth = 5, style }) {
  const render = ICONS[name];
  if (!render) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={style}>
      {render({ c: color, w: strokeWidth })}
    </Svg>
  );
}
