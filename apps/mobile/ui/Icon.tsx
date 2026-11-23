import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useI18n } from '../i18n';
import { directionalIcons, iconData, type IconName } from './icons.data';
import { useTheme } from './theme';
import type { ColourRoles } from './tokens';

export type { IconName } from './icons.data';

/**
 * 24-grid outline icon, 2 px stroke (DESIGN_SYSTEM.md §1.1). Size defaults to the
 * presentation's icon size. Directional icons (chevrons, arrows) mirror in RTL.
 * Decorative by default: give `label` when the icon is the only content.
 */
export function Icon({
  name,
  size,
  tone = 'text',
  colour,
  label,
  style,
}: {
  name: IconName;
  size?: number;
  tone?: keyof ColourRoles;
  /** Raw colour, for icons on a subject hue (always ink). */
  colour?: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { isRTL } = useI18n();
  const { colours, p } = useTheme();
  const s = size ?? p.iconSize;
  const stroke = colour ?? colours[tone];
  const flip = isRTL && directionalIcons.has(name);
  return (
    <View
      style={[{ width: s, height: s }, flip && { transform: [{ scaleX: -1 }] }, style]}
      accessible={Boolean(label)}
      accessibilityLabel={label}
      accessibilityRole={label ? 'image' : undefined}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      <Svg
        width={s}
        height={s}
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {iconData[name].map((sh, i) =>
          sh.t === 'path' ? (
            <Path key={i} d={sh.d} />
          ) : sh.t === 'circle' ? (
            <Circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} />
          ) : (
            <Rect key={i} x={sh.x} y={sh.y} width={sh.width} height={sh.height} rx={sh.rx} />
          ),
        )}
      </Svg>
    </View>
  );
}
