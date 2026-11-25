// Android push needs Firebase's google-services.json in the build. It is not in
// the repo: EAS provides it as a file environment variable (GOOGLE_SERVICES_JSON,
// see docs/environment.md "Push notifications"). Without it the app builds and
// runs; push registration just reports an error and messages still arrive in
// the inbox and as in-app toasts.
module.exports = ({ config }) => {
  const file = process.env.GOOGLE_SERVICES_JSON;
  if (!file) return config;
  return { ...config, android: { ...config.android, googleServicesFile: file } };
};
