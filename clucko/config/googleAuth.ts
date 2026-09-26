/**
 * Google OAuth Configuration for Clucko
 * 
 * ═════════════════════════════════════════════════════════════════════════════
 * 🚀 HOW TO REMOVE THE "TEST USERS" LIMITATION FOR PRODUCTION DEPLOYMENT
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * PROBLEM:
 * When testing, Google shows "Access blocked: Clucko has not completed the Google
 * verification process" unless an email is manually added to the Test Users list.
 * 
 * SOLUTION FOR DEPLOYMENT (NO GOOGLE VERIFICATION REQUIRED):
 * 1. Open Google Cloud Console: https://console.cloud.google.com/
 * 2. Select your project ("Clucko").
 * 3. Go to "APIs & Services" > "OAuth consent screen".
 * 4. Look at "Publishing status" (it is currently set to "Testing").
 * 5. Click the "PUBLISH APP" button!
 * 6. In the confirmation dialog, click "Confirm" / "Push to production".
 * 
 * WHY THIS WORKS INSTANTLY:
 * Clucko ONLY requests 3 standard non-sensitive scopes:
 *   - .../auth/userinfo.email
 *   - .../auth/userinfo.profile
 *   - openid
 * Google DOES NOT require manual verification, legal audits, or screen recordings
 * for non-sensitive scopes. Once you click "Publish App", it immediately becomes
 * "In production", and ANY user with ANY Google account can sign in without being
 * added to the test user list!
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTHORIZED REDIRECT URIs TO CONFIGURE IN GOOGLE CLOUD CONSOLE:
 * In Credentials > OAuth 2.0 Client IDs > Web Client:
 * 1. For Expo Go testing:
 *    - https://auth.expo.io/@anonymous/Clucko
 * 2. For Web deployment:
 *    - http://localhost:8081
 *    - http://127.0.0.1:8081
 *    - https://your-production-domain.com
 * ═════════════════════════════════════════════════════════════════════════════
 */

export const GOOGLE_AUTH_CONFIG = {
  // Web Client ID (Works across Expo Go, Web, and Android via AuthSession)
  webClientId: "968620025166-0dfmp6qlrf4oh2f6ssh2s79s0lia6v0a.apps.googleusercontent.com",

  // Android Client ID (Used when building standalone Android APKs via EAS Build)
  androidClientId: "",

  // iOS Client ID (Optional)
  iosClientId: "",
};

/**
 * Checks whether a real Google Client ID has been configured.
 */
export function isGoogleAuthConfigured(): boolean {
  const id = GOOGLE_AUTH_CONFIG.webClientId;
  return Boolean(
    id &&
    !id.includes("YOUR_GOOGLE_WEB_CLIENT_ID") &&
    id.includes(".apps.googleusercontent.com")
  );
}
