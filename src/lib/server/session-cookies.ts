import { combineChunks, isChunkLike, stringFromBase64URL } from '@supabase/ssr';

export const SESSION_COOKIE = 'sb-openpwd-auth-token';

const BASE64_PREFIX = 'base64-';

export interface CookiePair {
	name: string;
	value: string;
}

export const isSessionCookie = (name: string): boolean => isChunkLike(name, SESSION_COOKIE);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function decodeSegment(segment: string): unknown {
	const bytes = Buffer.from(segment, 'base64url');
	return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}

/** Whether the token can be decoded at all. Its signature is checked later, by the client. */
function isReadableJwt(token: string): boolean {
	const [header, payload, signature, ...rest] = token.split('.');
	if (!header || !payload || !signature || rest.length > 0) return false;
	try {
		const decodedHeader = decodeSegment(header);
		return (
			isRecord(decodedHeader) &&
			typeof decodedHeader.alg === 'string' &&
			isRecord(decodeSegment(payload))
		);
	} catch {
		return false;
	}
}

/**
 * The Supabase client loads the cookie's session in a promise nobody awaits, and reads its
 * token without guarding: a session it cannot handle (no refresh token, a `user` that is not
 * an object, a token that does not decode) ends in an unhandled rejection or a thrown error on
 * every page. Only a session with the expected shape is handed to it.
 */
export function isPlausibleSession(value: unknown): boolean {
	if (!isRecord(value)) return false;
	const { access_token, refresh_token, expires_at, user } = value;
	return (
		typeof access_token === 'string' &&
		isReadableJwt(access_token) &&
		typeof refresh_token === 'string' &&
		refresh_token !== '' &&
		(expires_at === undefined || typeof expires_at === 'number') &&
		(user === undefined || user === null || isRecord(user))
	);
}

export async function readStoredSession(cookies: readonly CookiePair[]): Promise<unknown> {
	const raw = await combineChunks(
		SESSION_COOKIE,
		(name) => cookies.find((cookie) => cookie.name === name)?.value
	);
	if (!raw) return undefined;
	try {
		const text = raw.startsWith(BASE64_PREFIX)
			? stringFromBase64URL(raw.slice(BASE64_PREFIX.length))
			: raw;
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}

/** Names of the session cookies that must be dropped instead of reaching the Supabase client. */
export async function malformedSessionCookies(cookies: readonly CookiePair[]): Promise<string[]> {
	const names = cookies.flatMap(({ name }) => (isSessionCookie(name) ? [name] : []));
	if (names.length === 0) return [];
	return isPlausibleSession(await readStoredSession(cookies)) ? [] : names;
}
