import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
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

  // 3. For Expo Go / Android, route through auth.expo.io/start so the proxy sets the returnUrl cookie
  const returnUrl = Linking.createURL('');
  const startUrl = isWeb
    ? googleAuthUrl
    : `https://auth.expo.io/@anonymous/Clucko/start?authUrl=${encodeURIComponent(googleAuthUrl)}&returnUrl=${encodeURIComponent(returnUrl)}`;

  const expectedRedirect = isWeb ? window.location.origin : returnUrl;

  try {
    // 4. Open browser auth session
    const result = await WebBrowser.openAuthSessionAsync(startUrl, expectedRedirect);

    if (result.type !== 'success') {
      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { success: false, error: 'Sign in was cancelled.' };
      }
      return { success: false, error: `Authentication failed (${result.type}).` };
    }

    // 5. Extract access_token from the redirect URL fragment or query
    const url = result.url;
    if (url.includes('errorCode=cookies-disabled')) {
      return {
        success: false,
        error: 'Browser cookies are disabled in Chrome. Please enable cookies in your mobile browser to sign in with Google.',
      };
    }

    let accessToken: string | null = null;

    if (url.includes('#')) {
      const fragment = url.split('#')[1];
      const params = new URLSearchParams(fragment);
      accessToken = params.get('access_token');
    } else if (url.includes('?')) {
      const query = url.split('?')[1];
      const params = new URLSearchParams(query);
      accessToken = params.get('access_token');
    }

    if (!accessToken) {
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

    // 6. Authenticate / register with Clucko backend
    const authPayload = {
      email: googleUser.email,
      first_name: googleUser.given_name || googleUser.name?.split(' ')[0] || 'Google',
      last_name: googleUser.family_name || googleUser.name?.split(' ').slice(1).join(' ') || 'User',
      picture: googleUser.picture,
      google_id: googleUser.id,
    };

    const backendResult = await apiGoogleAuth(authPayload);

    return {
      success: true,
      user: backendResult.user,
    };
  } catch (err: any) {
    console.error('Google Sign-In Error:', err);
    return {
      success: false,
      error: err.message || 'An unexpected error occurred during Google Sign-In.',
    };
  }
}
