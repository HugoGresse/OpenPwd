import type { Cookies } from '@sveltejs/kit';
import { secureCookie } from './supabase';

const COOKIE_NAME = 'openpwd-google-token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
/** Google access tokens live one hour. Expiring the cookie first forces a clean re-sign-in. */
const TOKEN_LIFETIME_SECONDS = 55 * 60;

/** `openid` makes Google return an ID token, which is where Supabase reads the `hd` claim. */
export const GOOGLE_SCOPES = 'openid https://www.googleapis.com/auth/cloudkms';

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

export interface LinkedIdentity {
	provider: string;
	identity_data?: Record<string, unknown> | null;
}

const hostedDomainOf = (identity: LinkedIdentity): string | undefined => {
	const claims = identity.identity_data?.custom_claims;
	const hd = typeof claims === 'object' && claims !== null ? (claims as { hd?: unknown }).hd : '';
	return typeof hd === 'string' ? hd.toLowerCase() : undefined;
};

/**
 * `hd` only exists for Google Workspace accounts: checking the email domain alone would let in
 * a personal Google account registered on a company address.
 *
 * The authoritative source is the `hd` claim of the ID token, which Supabase verifies and
 * stores on the identity (not in the user-editable metadata). Every linked Google identity
 * must carry it, so a second, personal Google account linked to the same email is refused.
 * The userinfo answer is a second opinion on the account that just signed in: it can veto,
 * never approve.
 */
export function isWorkspaceSignIn(
	identities: readonly LinkedIdentity[],
	userinfo: GoogleIdentity | undefined,
	domain: string
): boolean {
	const expected = domain.toLowerCase();
	const google = identities.filter((identity) => identity.provider === 'google');
	if (google.length === 0) return false;
	if (google.some((identity) => hostedDomainOf(identity) !== expected)) return false;
	if (!userinfo) return true;
	if (userinfo.email_verified === false) return false;
	return userinfo.hd === undefined || userinfo.hd.toLowerCase() === expected;
}

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

const NEXT_BASE = 'https://openpwd.invalid';

export function safeNextPath(next: string | null): string {
	if (!next?.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
	if (!URL.canParse(next, NEXT_BASE) || new URL(next, NEXT_BASE).origin !== NEXT_BASE) return '/';
	// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
	return /[\u0000-\u001f]|%0[0-9a-f]|%1[0-9a-f]/i.test(next) ? '/' : next;
}
