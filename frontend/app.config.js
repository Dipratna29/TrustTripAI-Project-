/**
 * Dynamic Expo config: lets EAS builds inject the production API URL without editing app.json.
 *   API_BASE_URL=https://trusttrip-api-r5vu.onrender.com eas build -p android --profile preview
 * (or set it per profile in eas.json "env").
 */
const fs = require("fs");
const path = require("path");

// Firebase Cloud Messaging config for Android push tokens. Never committed: provide it as an
// EAS "file" environment variable named GOOGLE_SERVICES_JSON, or place google-services.json
// next to this file for local builds.
const localGoogleServices = path.join(__dirname, "google-services.json");
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(localGoogleServices) ? "./google-services.json" : undefined);

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    ...(googleServicesFile ? { googleServicesFile } : {}),
  },
  extra: {
    ...config.extra,
    API_BASE_URL: process.env.API_BASE_URL || config.extra?.API_BASE_URL,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || config.extra?.RAZORPAY_KEY_ID || "",
    eas: {
      ...(config.extra?.eas || {}),
      ...(process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : {}),
    },
  },
});
