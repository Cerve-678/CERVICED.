const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// SVG transformer configuration
config.transformer.babelTransformerPath = require.resolve(
  "react-native-svg-transformer",
);
config.resolver.assetExts = config.resolver.assetExts.filter(
  (ext) => ext !== "svg",
);
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

module.exports = config;

// Web build only: every `expo-blur` import gets the website's BlurView, which
// keeps a component's own background colour the way the phone does (see
// src/web/WebBlurView.tsx). That file imports expo-blur itself, so it's left
// to the normal resolver. The phone app's bundles never see this.
const path = require("path");
const WEB_BLUR_VIEW = path.join(__dirname, "src/web/WebBlurView.tsx");
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "expo-blur" && context.originModulePath !== WEB_BLUR_VIEW) {
    return { type: "sourceFile", filePath: WEB_BLUR_VIEW };
  }
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};
