/**
 * Dynamic Expo config: lets EAS builds inject the production API URL without editing app.json.
 *   API_BASE_URL=https://trusttrip-api-r5vu.onrender.com eas build -p android --profile preview
 * (or set it per profile in eas.json "env").
 */
module.exports = ({ config }) => ({
  ...config,
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
