import * as AuthSession from 'expo-auth-session';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { GOOGLE_AUTH_CONFIG, isGoogleAuthConfigured } from '../config/googleAuth';
import { apiGoogleAuth } from '../lib/api';

// Complete any pending browser auth sessions on web/native
WebBrowser.maybeCompleteAuthSession();

// Standard Expo Go redirect URI registered in Google Cloud Console
export const GOOGLE_REDIRECT_URI = 'https://auth.expo.io/@anonymous/Clucko';

export interface GoogleAuthResult {
  success: boolean;
  error?: string;
  isNotConfigured?: boolean;
  user?: any;
  subscription?: any;
}

/**
 * Returns a guaranteed valid return URL for OAuth callbacks:
 * - Web: window.location.origin
 * - Expo Go: exp://<host>/--/expo-auth-session (valid URI scheme recognized by Android OS for Expo Go)
 * - Standalone APK: clucko://expo-auth-session
 */
export function getEffectiveReturnUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && Boolean(window.location?.origin)) {
    return window.location.origin;
  }

  // Check strictly if running inside Expo Go client
  // In a standalone APK, executionEnvironment is 'standalone' and expoVersion is null.
  // In Expo Go, executionEnvironment is 'storeClient', appOwnership is 'expo', and expoVersion is a string.
  const isExpoGo =
    (Constants as any).appOwnership === 'expo' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Boolean(Constants.expoVersion);

  if (isExpoGo) {
    let host = '';

    // 1. Try NativeModules.SourceCode?.scriptURL (points directly to Metro server in React Native)
    try {
      const scriptURL = NativeModules.SourceCode?.scriptURL;
      if (scriptURL) {
        const match = scriptURL.match(/^https?:\/\/([^/]+)/);
        if (match && match[1]) {
          host = match[1];
        }
      }
    } catch {}

    // 2. Try Constants.linkingUri
    if (!host && (Constants as any).linkingUri) {
      const match = String((Constants as any).linkingUri).match(/^[a-zA-Z0-9+.-]+:\/\/([^/]+)/);
      if (match && match[1] && !match[1].startsWith('--')) {
        host = match[1];
      }
    }

    // 3. Try Constants host fields
    if (!host) {
      const rawHost =
        (Constants as any).expoConfig?.hostUri ||
        (Constants as any).manifest?.debuggerHost ||
        (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
        '';
      if (rawHost) {
        host = String(rawHost).replace(/\/.*$/, '');
      }
    }

    // 4. Fallback to active dev server IP on local network
    if (!host) {
      host = '192.168.1.7:8081';
    }

    return `exp://${host}/--/expo-auth-session`;
  }

  // Standalone installed Android APK (Direct custom scheme registered in AndroidManifest.xml)
  return 'clucko://expo-auth-session';
}

/**
 * Extracts the access token from any OAuth redirect URL (fragment # or query ?).
 */
export function extractAccessTokenFromUrl(url: string): string | null {
  if (!url) return null;

  if (url.includes('#')) {
    const fragment = url.split('#')[1];
    const params = new URLSearchParams(fragment);
    const token = params.get('access_token');
    if (token) return token;
  }

  if (url.includes('?')) {
    const query = url.split('?')[1];
    const params = new URLSearchParams(query);
    const token = params.get('access_token');
    if (token) return token;
  }

  const match = url.match(/[#?&]access_token=([^&]+)/);
  if (match && match[1]) {
    return decodeURIComponent(match[1]);
  }

  return null;
}

/**
 * Initiates real Google OAuth 2.0 Sign-In using Expo WebBrowser and Auth Proxy.
 * Uses auth.expo.io/start to establish returnUrl session so the proxy can safely
 * redirect the authenticated tokens back into the Expo Go mobile app.
 */
export async function performGoogleSignIn(): Promise<GoogleAuthResult> {
  // 1. Check if the user has provided their real Google Client ID
  if (!isGoogleAuthConfigured()) {
    return {
      success: false,
      isNotConfigured: true,
      error:
        'Google Client ID is not configured yet. Please open clucko/config/googleAuth.ts and add your Web Client ID from Google Cloud Console.',
    };
  }

  const clientId = GOOGLE_AUTH_CONFIG.webClientId;
  const isWeb = Platform.OS === 'web' && typeof window !== 'undefined' && Boolean(window.location?.origin);

  // 2. Build Google OAuth 2.0 Authorization URL
  const googleAuthUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(isWeb ? window.location.origin : GOOGLE_REDIRECT_URI)}` +
    `&response_type=token` +
    `&scope=${encodeURIComponent('openid email profile')}` +
    `&prompt=select_account`;

  // 3. Determine redirect URL for Expo Go vs Standalone / Web.
  // In Expo Go, returnUrl is guaranteed to be exp://<host>/--/expo-auth-session,
  // which is a valid URI accepted by auth.expo.io and routed directly into Expo Go.
  // In standalone builds, AuthSession.makeRedirectUri uses clucko://expo-auth-session.
  const returnUrl = getEffectiveReturnUrl();

  const startUrl = isWeb
    ? googleAuthUrl
    : `https://auth.expo.io/@anonymous/Clucko/start?authUrl=${encodeURIComponent(googleAuthUrl)}&returnUrl=${encodeURIComponent(returnUrl)}`;

  const expectedRedirect = isWeb ? window.location.origin : returnUrl;

  try {
    // 4. Open browser auth session with deep link event fallback
    let capturedUrl: string | null = null;
    let linkSub: any = null;

    if (!isWeb) {
      linkSub = Linking.addEventListener('url', (event) => {
        if (
          event.url &&
          (event.url.includes('access_token') ||
            event.url.includes('error') ||
            event.url.includes('expo-auth-session') ||
            event.url.includes('oauth') ||
            event.url.includes('id_token'))
        ) {
          capturedUrl = event.url;
          try {
            WebBrowser.dismissAuthSession();
          } catch {}
        }
      });
    }

    try {
      const result = await WebBrowser.openAuthSessionAsync(startUrl, expectedRedirect);
      if (result.type === 'success' && result.url) {
        capturedUrl = result.url;
      }
    } finally {
      if (linkSub && typeof linkSub.remove === 'function') {
        linkSub.remove();
      }
    }

    // Check if initial URL or resume link captured the redirect token
    if (!capturedUrl) {
      const initialUrl = await Linking.getInitialURL();
      if (
        initialUrl &&
        (initialUrl.includes('access_token') ||
          initialUrl.includes('expo-auth-session') ||
          initialUrl.includes('oauth'))
      ) {
        capturedUrl = initialUrl;
      }
    }

    // Check if expo-auth-session route handler already completed authentication and stored session
    if (!capturedUrl) {
      await new Promise((r) => setTimeout(r, 600));
      const token = await AsyncStorage.getItem('token');
      const userStr = await AsyncStorage.getItem('userData');
      if (token && userStr) {
        try {
          return {
            success: true,
            user: JSON.parse(userStr),
          };
        } catch {}
      }
    }

    if (!capturedUrl) {
      const token = await AsyncStorage.getItem('token');
      const userStr = await AsyncStorage.getItem('userData');
      if (token && userStr) {
        try {
          return {
            success: true,
            user: JSON.parse(userStr),
          };
        } catch {}
      }
      return { success: false, error: 'Sign in was cancelled.' };
    }

    // 5. Extract access_token from the redirect URL fragment or query
    const url = capturedUrl;
    if (url.includes('errorCode=cookies-disabled')) {
      return {
        success: false,
        error: 'Browser cookies are disabled in Chrome. Please enable cookies in your mobile browser to sign in with Google.',
      };
    }

    if (url.includes('error=access_denied') || url.includes('error=org_internal')) {
      return {
        success: false,
        error: 'Google Sign-In was blocked. For deployment, make sure to change your Google Cloud Console OAuth consent screen status from "Testing" to "In production" (Publish App) so all users can sign in without needing to be added to test users.',
      };
    }

    const accessToken = extractAccessTokenFromUrl(url);

    if (!accessToken) {
      // Check if session was stored by expo-auth-session
      const token = await AsyncStorage.getItem('token');
      const userStr = await AsyncStorage.getItem('userData');
      if (token && userStr) {
        try {
          return {
            success: true,
            user: JSON.parse(userStr),
          };
        } catch {}
      }
      return {
        success: false,
        error: 'Could not extract access token from Google response.',
      };
    }

    // 5. Fetch user profile from Google UserInfo API
    const userInfoRes = await fetch('https://www.googleapis.com/userinfo/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      return {
        success: false,
        error: 'Failed to fetch user profile from Google.',
      };
    }

    const googleUser = await userInfoRes.json();
    if (!googleUser.email) {
      return {
        success: false,
        error: 'Google account did not return an email address.',
      };
    }

    // 6. Extract real first name, last name, and phone number from Google
    let firstName = (googleUser.given_name || '').trim();
    let lastName = (googleUser.family_name || '').trim();
    const fullName = (googleUser.name || '').trim();

    if (!firstName && fullName) {
      const parts = fullName.split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    } else if (firstName && !lastName && fullName) {
      const parts = fullName.split(/\s+/);
      if (parts.length > 1 && parts[0].toLowerCase() === firstName.toLowerCase()) {
        lastName = parts.slice(1).join(' ');
      }
    }

    if (!firstName) {
      firstName = googleUser.email.split('@')[0] || 'User';
    }

    // Try fetching People API to retrieve phone number if granted/available
    let phoneNumber = '';
    try {
      const peopleRes = await fetch(
        'https://people.googleapis.com/v1/people/me?personFields=phoneNumbers,names',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (peopleRes.ok) {
        const peopleData = await peopleRes.json();
        if (peopleData.phoneNumbers && peopleData.phoneNumbers.length > 0) {
          phoneNumber = peopleData.phoneNumbers[0].value || peopleData.phoneNumbers[0].canonicalForm || '';
        }
        if (!lastName && peopleData.names && peopleData.names.length > 0) {
          const pName = peopleData.names[0];
          if (pName.familyName) lastName = pName.familyName;
          if (!firstName && pName.givenName) firstName = pName.givenName;
        }
      }
    } catch {
      // People API optional
    }

    // 7. Authenticate / register with Clucko backend
    const authPayload = {
      email: googleUser.email,
      name: fullName,
      first_name: firstName,
      last_name: lastName, // NEVER 'User'
      phone: phoneNumber,
      picture: googleUser.picture,
      google_id: googleUser.id,
    };

    const backendResult = await apiGoogleAuth(authPayload);

    return {
      success: true,
      user: backendResult.user,
      subscription: backendResult.subscription,
    };
  } catch (err: any) {
    console.error('Google Sign-In Error:', err);
    return {
      success: false,
      error: err.message || 'An unexpected error occurred during Google Sign-In.',
    };
  }
}
