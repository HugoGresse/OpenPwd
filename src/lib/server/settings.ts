import {
	ALLOWED_GOOGLE_DOMAIN,
	DEV_LOGIN_PASSWORD,
	KMS_KEY_NAME,
	KMS_MODE,
	LOCAL_KMS_KEY,
	SUPABASE_PUBLISHABLE_KEY,
	SUPABASE_URL
} from '$app/env/private';
import { allowsLocalMode, type CipherSettings } from './crypto/resolve-cipher';

export const cipherSettings: CipherSettings = {
	mode: KMS_MODE,
	supabaseUrl: SUPABASE_URL,
	defaultKeyName: KMS_KEY_NAME,
	localKey: LOCAL_KMS_KEY
};

export const settings = {
	supabaseUrl: SUPABASE_URL,
	supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY,
	allowedGoogleDomain: ALLOWED_GOOGLE_DOMAIN,
	devLoginPassword: DEV_LOGIN_PASSWORD,
	/** True only for `KMS_MODE=local` against a local database: enables the dev sign-in form. */
	isLocalMode: allowsLocalMode(cipherSettings),
	requiresGoogleToken: KMS_MODE === 'google'
} as const;
