// Explicit so the old app's root babel.config.js (Reanimated 3 plugin) never
// applies here. babel-preset-expo adds the Reanimated 4 / worklets plugin itself.
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
