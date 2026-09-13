/**
 * Google OAuth Configuration for Clucko
 * 
 * INSTRUCTIONS TO CONNECT REAL GOOGLE ACCOUNTS:
 * 1. Go to Google Cloud Console: https://console.cloud.google.com/
 * 2. Create a project named "Clucko" (or select your existing project).
 * 3. Go to "APIs & Services" > "OAuth consent screen". Select "External" and fill in App Name ("Clucko") and user support email.
 * 4. Go to "Credentials" > "+ CREATE CREDENTIALS" > "OAuth client ID".
 *    - For Expo Go & Web testing: Select Application type "Web application".
 *      Add Authorized redirect URI:
 *      - https://auth.expo.io/@anonymous/Clucko (or your Expo username slug)
 *    - Copy the generated "Client ID" and paste it into `webClientId` below.
 * 5. (Optional for Android Standalone APK build):
 *    - Create an "Android" OAuth client ID with package name `com.anonymous.Clucko` and your SHA-1 fingerprint.
 */

export const GOOGLE_AUTH_CONFIG = {
  // Web Client ID (Recommended: Works across Expo Go, Web, and Android via AuthSession)
  webClientId: "968620025166-0dfmp6qlrf4oh2f6ssh2s79s0lia6v0a.apps.googleusercontent.com",

  // Android Client ID (Used when building standalone Android APKs)
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
