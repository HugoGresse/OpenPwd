import { describe, expect, it } from 'vitest';
import { toBase64 } from './crypto/cipher';
import { createLocalCipher } from './crypto/local-cipher';
import { buildAad, parseBlob, serializeBlob, type SecretBlob } from './crypto/secret-blob';
import { updateEntry, type EntryInput, type EntryServices } from './entries';
import { toFailure } from './failures';

const ENTRY_ID = '3849fabf-3934-47c3-a299-93e87e825680';
const stored: SecretBlob = {
	password: 'old-password',
	note: 'old note',
	fields: [{ label: 'PIN', value: '1111' }]
};
const input: EntryInput = {
	title: 'Bank',
	url: '',
	username: 'jo',
	password: '',
	note: 'submitted note',
	fields: []
};

async function harness(storedVersion: number) {
	const cipher = await createLocalCipher(toBase64(new Uint8Array(32).fill(3)));
	const ciphertext = await cipher.encrypt(serializeBlob(stored), buildAad(ENTRY_ID, storedVersion));
	const updates: Record<string, unknown>[] = [];

	const rpc = (name: string, args: Record<string, unknown>) => {
		if (name === 'update_entry') updates.push(args);
		const row = { ciphertext, version: storedVersion, key_name: null };
		const result = Promise.resolve({ data: null, error: null });
		return Object.assign(result, {
			single: () => Promise.resolve({ data: row, error: null })
		});
	};
	const services = {
		supabase: { rpc },
		cipherFor: () => Promise.resolve(cipher)
	} as unknown as EntryServices;

	const savedBlob = async () => {
		const saved = updates[0];
		if (!saved) return undefined;
		const aad = buildAad(ENTRY_ID, saved.p_secret_version as number);
		return parseBlob(await cipher.decrypt(saved.p_ciphertext as string, aad));
	};
	return { services, updates, savedBlob };
}

describe('updateEntry', () => {
	it('keeps the stored password, note and fields when the form never unlocked them', async () => {
		const { services, updates, savedBlob } = await harness(4);

		await updateEntry(services, ENTRY_ID, { input, expectedVersion: 4, replaceSecrets: false });

		expect(await savedBlob()).toEqual(stored);
		expect(updates[0]).toMatchObject({ p_secret_version: 5, p_has_note: true });
		expect(updates[0]?.p_field_labels).toEqual(['PIN']);
	});

	it('replaces note and fields once unlocked, and the password only when one is typed', async () => {
		const { services, savedBlob } = await harness(1);

		await updateEntry(services, ENTRY_ID, {
			input: { ...input, password: 'new-password' },
			expectedVersion: 1,
			replaceSecrets: true
		});

		expect(await savedBlob()).toEqual({
			password: 'new-password',
			note: 'submitted note',
			fields: []
		});
	});

	it('refuses to save over a change made after the form was opened', async () => {
		const { services, updates } = await harness(7);
		const attempt = updateEntry(services, ENTRY_ID, {
			input,
			expectedVersion: 6,
			replaceSecrets: true
		});

		const failure = toFailure(await attempt.catch((error: unknown) => error));
		expect(failure.code).toBe('version_conflict');
		expect(updates).toEqual([]);
	});
});
