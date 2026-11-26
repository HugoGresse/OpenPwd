import { CipherError, type SecretCipher } from './cipher';
import { createGoogleKmsCipher } from './google-kms';
import { createLocalCipher } from './local-cipher';

export interface CipherSettings {
	mode: 'google' | 'local';
	supabaseUrl: string;
	defaultKeyName: string | undefined;
	localKey: string | undefined;
}

export interface CipherContext {
	fetch: typeof globalThis.fetch;
	googleAccessToken: string | undefined;
	organizationKeyName: string | null;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export const isLocalDatabase = (supabaseUrl: string): boolean =>
	LOCAL_HOSTS.has(new URL(supabaseUrl).hostname);

export const allowsLocalMode = (settings: CipherSettings): boolean =>
	settings.mode === 'local' && isLocalDatabase(settings.supabaseUrl);

export async function resolveCipher(
	settings: CipherSettings,
	context: CipherContext
): Promise<SecretCipher> {
	if (settings.mode === 'local') {
		if (!allowsLocalMode(settings) || !settings.localKey) {
			throw new CipherError(
				'unavailable',
				'KMS_MODE=local needs LOCAL_KMS_KEY and a local Supabase database'
			);
		}
		return createLocalCipher(settings.localKey);
	}

	const keyName = context.organizationKeyName ?? settings.defaultKeyName;
	if (!keyName) throw new CipherError('unavailable', 'No KMS key is configured');
	if (!context.googleAccessToken) {
		throw new CipherError('reauth_required', 'Google access token is missing or expired');
	}
	return createGoogleKmsCipher({
		fetch: context.fetch,
		keyName,
		accessToken: context.googleAccessToken
	});
}
