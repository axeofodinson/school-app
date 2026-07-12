// Pixel-art sprite — renders one of the pre-baked PNGs from assets/sprites/
// (drawn in scripts/generate-sprites.mjs). A single <Image> per sprite is the
// cheapest render path on low-end Android: no view trees, no vector work.
//
// The PNGs are pre-scaled (crisp chunky pixels baked in), so any display size
// up to ~64dp stays sharp. Sprites are pictures, not text — they are never
// mirrored for RTL.
import { Image } from 'react-native';

const SPRITES = {
  sword: require('../../../assets/sprites/sword.png'),
  shield: require('../../../assets/sprites/shield.png'),
  scroll: require('../../../assets/sprites/scroll.png'),
  star: require('../../../assets/sprites/star.png'),
  bolt: require('../../../assets/sprites/bolt.png'),
  heart: require('../../../assets/sprites/heart.png'),
  chest: require('../../../assets/sprites/chest.png'),
  trophy: require('../../../assets/sprites/trophy.png'),
  sprout: require('../../../assets/sprites/sprout.png'),
  speaker: require('../../../assets/sprites/speaker.png'),
  check: require('../../../assets/sprites/check.png'),
  flame: require('../../../assets/sprites/flame.png'),
  medal: require('../../../assets/sprites/medal.png'),
};

export default function Sprite({ name, size = 40, style }) {
  const source = SPRITES[name];
  if (!source) return null;
  return (
    <Image
      source={source}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
