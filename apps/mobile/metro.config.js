// Monorepo Metro config. The old app at the repo root pins React 18 / RN 0.74 /
// Reanimated 3, so this app's copies live in apps/mobile/node_modules while other
// deps hoist to the root. Normal (hierarchical) lookup stays on so packages with
// their own nested node_modules get the version they asked for; only the
// singletons below are forced to this app's copy, so there is exactly one React,
// one React Native, etc. in the bundle even when a hoisted package (e.g. react-native-svg)
// imports them from the root.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const SINGLETONS = [
  'react',
  'react-dom',
  'react-native',
  'react-native-web',
  'react-native-reanimated',
  'react-native-worklets',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-gesture-handler',
  '@react-native-async-storage/async-storage',
  'expo',
  'expo-modules-core',
  'expo-router',
];

const isSingleton = (name) => SINGLETONS.some((s) => name === s || name.startsWith(`${s}/`));

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  path.join(workspaceRoot, 'packages'),
  path.join(workspaceRoot, 'node_modules'),
];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, 'node_modules'),
  path.join(workspaceRoot, 'node_modules'),
];

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  if (isSingleton(moduleName)) {
    // Resolve as if imported from this app's root, whoever imports it.
    return resolve(
      { ...context, originModulePath: path.join(projectRoot, 'package.json') },
      moduleName,
      platform,
    );
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
