import { describe, expect, it } from 'vitest';
import {
	isPlausibleSession,
	malformedSessionCookies,
	readStoredSession,
	SESSION_COOKIE
} from './session-cookies';

const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = `${segment({ alg: 'ES256', kid: 'k' })}.${segment({ sub: 'u', exp: 1 })}.c2ln`;
const session = { access_token: jwt, refresh_token: 'refresh', expires_at: 1_800_000_000 };
const encode = (value: unknown) => `base64-${segment(value)}`;
const asCookie = (value: unknown) => [{ name: SESSION_COOKIE, value: encode(value) }];

describe('isPlausibleSession', () => {
	it('accepts what the Supabase client stores, expired or not', () => {
		expect(isPlausibleSession({ ...session, user: { id: 'u' } })).toBe(true);
		expect(isPlausibleSession({ ...session, expires_at: 1 })).toBe(true);
	});

	it.each([
		['an empty refresh token', { ...session, refresh_token: '' }],
		['a user that is not an object', { ...session, user: 1 }],
		['a token that is not a JWT', { ...session, access_token: 'nope' }],
		['a token with three parts that do not decode', { ...session, access_token: 'aaaa.bbbb.cccc' }],
		['a token whose header is null', { ...session, access_token: `${segment(null)}.e30.c2ln` }],
		[
			'a token whose payload is not JSON',
			{ ...session, access_token: `${segment({ alg: 'HS256' })}.bm90IGpzb24.c2ln` }
		],
		['a non-numeric expiry', { ...session, expires_at: 'soon' }],
		['an array', [session]],
		['nothing', null]
	])('refuses %s, which the Supabase client would crash on', (_, value) => {
		expect(isPlausibleSession(value)).toBe(false);
	});
});

describe('readStoredSession', () => {
	it('reads a base64 cookie, a plain one and a chunked one', async () => {
		const encoded = encode(session);

		expect(await readStoredSession(asCookie(session))).toEqual(session);
		expect(
			await readStoredSession([{ name: SESSION_COOKIE, value: JSON.stringify(session) }])
		).toEqual(session);
		expect(
			await readStoredSession([
				{ name: `${SESSION_COOKIE}.0`, value: encoded.slice(0, 20) },
				{ name: `${SESSION_COOKIE}.1`, value: encoded.slice(20) }
			])
		).toEqual(session);
	});

	it('returns null for a cookie that does not decode', async () => {
		expect(await readStoredSession([{ name: SESSION_COOKIE, value: 'garbage' }])).toBeNull();
	});
});

describe('malformedSessionCookies', () => {
	it('leaves a real session and the sign-in verifier cookie alone', async () => {
		const verifier = { name: `${SESSION_COOKIE}-code-verifier`, value: 'x' };

		expect(await malformedSessionCookies([...asCookie(session), verifier])).toEqual([]);
		expect(await malformedSessionCookies([verifier])).toEqual([]);
	});

	it('names every chunk of a crafted session, and nothing else', async () => {
		const crafted = encode({ access_token: 'a.b.c', refresh_token: '', expires_at: 1 });
		const cookies = [
			{ name: `${SESSION_COOKIE}.0`, value: crafted.slice(0, 10) },
			{ name: `${SESSION_COOKIE}.1`, value: crafted.slice(10) },
			{ name: 'openpwd-google-token', value: 'token' }
		];

		expect(await malformedSessionCookies(cookies)).toEqual([
			`${SESSION_COOKIE}.0`,
			`${SESSION_COOKIE}.1`
		]);
	});
});
