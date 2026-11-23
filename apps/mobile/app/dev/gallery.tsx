import { Redirect } from 'expo-router';

import { Gallery } from '../../features/gallery/Gallery';

/**
 * Hidden developer route (not linked anywhere). Available in development builds, or in
 * a web/preview build made with EXPO_PUBLIC_DEV_GALLERY=1. Production users are redirected.
 * Query params set the starting state: ?lang=ur&theme=dark&tier=lite&p=kid&exam=1
 */
export default function GalleryRoute() {
  if (!__DEV__ && process.env.EXPO_PUBLIC_DEV_GALLERY !== '1') return <Redirect href="/" />;
  return <Gallery />;
}
