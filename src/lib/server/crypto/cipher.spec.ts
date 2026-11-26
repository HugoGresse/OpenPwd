import { describe, expect, it, vi } from 'vitest';
import { CipherError, toBase64 } from './cipher';
import { classifyKmsFailure, createGoogleKmsCipher, isValidKeyName } from './google-kms';
import { createLocalCipher } from './local-cipher';
import { resolveCipher, type CipherSettings } from './resolve-cipher';

const KEY_NAME = 'projects/acme/locations/europe-west1/keyRings/openpwd/cryptoKeys/vault';
const LOCAL_KEY = toBase64(new Uint8Array(32).fill(7));
const text = (value: string) => new TextEncoder().encode(value);

const jsonResponse = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const reasonOf = async (promise: Promise<unknown>) => {
	const error = await promise.then(
		() => undefined,
		(caught: unknown) => caught
	);
	return error instanceof CipherError ? error.reason : undefined;
};

describe('Google KMS cipher', () => {
	it('calls KMS as the member, with the entry bound as authenticated data', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(() =>
			Promise.resolve(jsonResponse(200, { ciphertext: 'c2VhbGVk' }))
		);
		const cipher = createGoogleKmsCipher({ fetch, keyName: KEY_NAME, accessToken: 'member-token' });

		await expect(cipher.encrypt(text('hello'), 'openpwd/entry/e1/v1')).resolves.toBe('c2VhbGVk');

		const [url, init] = fetch.mock.calls[0];
		expect(url).toBe(`https://cloudkms.googleapis.com/v1/${KEY_NAME}:encrypt`);
		expect(new Headers(init?.headers).get('authorization')).toBe('Bearer member-token');
		expect(JSON.parse(init?.body as string)).toEqual({
			plaintext: toBase64(text('hello')),
			additionalAuthenticatedData: toBase64(text('openpwd/entry/e1/v1'))
		});
	});

	it('decodes the plaintext returned by decrypt', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(() =>
			Promise.resolve(jsonResponse(200, { plaintext: toBase64(text('secret')) }))
		);
		const cipher = createGoogleKmsCipher({ fetch, keyName: KEY_NAME, accessToken: 't' });

		expect(new TextDecoder().decode(await cipher.decrypt('abc', 'aad'))).toBe('secret');
	});

	it.each<[number, Parameters<typeof classifyKmsFailure>[1], string]>([
		[401, {}, 'reauth_required'],
		[
			403,
			{ error: { details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] } },
			'reauth_required'
		],
		[403, { error: { status: 'PERMISSION_DENIED' } }, 'forbidden'],
		[400, {}, 'corrupt'],
		[503, {}, 'unavailable']
	])('maps HTTP %i to a failure reason', (status, body, expected) => {
		expect(classifyKmsFailure(status, body)).toBe(expected);
	});

	it('never sends a request for a key name that is not a crypto key resource', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		const cipher = createGoogleKmsCipher({
			fetch,
			keyName: `${KEY_NAME}/../../other?x=`,
			accessToken: 't'
		});

		expect(await reasonOf(cipher.decrypt('abc', 'aad'))).toBe('unavailable');
		expect(fetch).not.toHaveBeenCalled();
		expect(isValidKeyName(KEY_NAME)).toBe(true);
	});

	it('reports a network failure as unavailable', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.reject(new Error('offline')));
		const cipher = createGoogleKmsCipher({ fetch, keyName: KEY_NAME, accessToken: 't' });

		expect(await reasonOf(cipher.encrypt(text('x'), 'aad'))).toBe('unavailable');
	});
});

describe('local cipher', () => {
	it('round-trips a secret', async () => {
		const cipher = await createLocalCipher(LOCAL_KEY);
		const sealed = await cipher.encrypt(text('secret'), 'aad-1');

		expect(new TextDecoder().decode(await cipher.decrypt(sealed, 'aad-1'))).toBe('secret');
	});

	it('refuses a ciphertext moved to another entry or version', async () => {
		const cipher = await createLocalCipher(LOCAL_KEY);
		const sealed = await cipher.encrypt(text('secret'), 'openpwd/entry/a/v1');

		expect(await reasonOf(cipher.decrypt(sealed, 'openpwd/entry/b/v1'))).toBe('corrupt');
	});

	it('rejects a key of the wrong size', async () => {
		expect(await reasonOf(createLocalCipher(toBase64(new Uint8Array(16))))).toBe('unavailable');
	});
});

describe('resolveCipher', () => {
	const context = { fetch: vi.fn(), googleAccessToken: 'token', organizationKeyName: null };
	const google: CipherSettings = {
		mode: 'google',
		supabaseUrl: 'https://project.supabase.co',
		defaultKeyName: KEY_NAME,
		localKey: undefined
	};

	it('refuses the local cipher against a hosted database', async () => {
		const settings: CipherSettings = { ...google, mode: 'local', localKey: LOCAL_KEY };

		expect(await reasonOf(resolveCipher(settings, context))).toBe('unavailable');
	});

	it('allows the local cipher against a local database', async () => {
		const settings: CipherSettings = {
			...google,
			mode: 'local',
			localKey: LOCAL_KEY,
			supabaseUrl: 'http://127.0.0.1:54321'
		};

		await expect(resolveCipher(settings, context)).resolves.toBeDefined();
	});

	it('asks for a new Google sign-in when the access token is gone', async () => {
		const withoutToken = { ...context, googleAccessToken: undefined };

		expect(await reasonOf(resolveCipher(google, withoutToken))).toBe('reauth_required');
	});

	it('fails when no key is configured anywhere', async () => {
		const settings = { ...google, defaultKeyName: undefined };

		expect(await reasonOf(resolveCipher(settings, context))).toBe('unavailable');
	});
});
