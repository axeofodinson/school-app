module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated's worklet transform. MUST stay the last plugin in this list
    // (reanimated requirement) — add any new plugins above it.
    plugins: ['react-native-reanimated/plugin'],
  };
};
