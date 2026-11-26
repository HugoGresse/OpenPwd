import type { Cookies } from '@sveltejs/kit';
import { secureCookie } from './supabase';

const COOKIE_NAME = 'openpwd-google-token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
/** Google access tokens live one hour. Expiring the cookie first forces a clean re-sign-in. */
const TOKEN_LIFETIME_SECONDS = 55 * 60;

export const KMS_SCOPE = 'https://www.googleapis.com/auth/cloudkms';

export const readGoogleToken = (cookies: Cookies): string | undefined => cookies.get(COOKIE_NAME);

export const storeGoogleToken = (cookies: Cookies, token: string): void =>
	cookies.set(COOKIE_NAME, token, { ...secureCookie, maxAge: TOKEN_LIFETIME_SECONDS });

export const clearGoogleToken = (cookies: Cookies): void =>
	cookies.delete(COOKIE_NAME, { path: '/' });

export interface GoogleIdentity {
	email?: string;
	email_verified?: boolean;
	hd?: string;
}

/**
 * `hd` is only present for Google Workspace accounts. Checking the email domain alone would
 * let in a personal Google account registered on a company address.
 */
export const belongsToWorkspace = (identity: GoogleIdentity, domain: string): boolean =>
	identity.email_verified === true && identity.hd?.toLowerCase() === domain.toLowerCase();

export async function fetchGoogleIdentity(
	fetch: typeof globalThis.fetch,
	accessToken: string
): Promise<GoogleIdentity | undefined> {
	const response = await fetch(USERINFO_ENDPOINT, {
		headers: { authorization: `Bearer ${accessToken}` },
		signal: AbortSignal.timeout(10_000)
	}).catch(() => undefined);
	if (!response?.ok) return undefined;
	return (await response.json()) as GoogleIdentity;
}

export function safeNextPath(next: string | null): string {
	if (!next?.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
	return next;
}
