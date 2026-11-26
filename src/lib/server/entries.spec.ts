import { describe, expect, it } from 'vitest';
import { toBase64 } from './crypto/cipher';
import { createLocalCipher } from './crypto/local-cipher';
import { buildAad, parseBlob, serializeBlob, type SecretBlob } from './crypto/secret-blob';
import * as v from 'valibot';
import {
	entryInputSchema,
	readEntryForm,
	updateEntry,
	type EntryInput,
	type EntryServices
} from './entries';
import { toFailure } from './failures';

const ENTRY_ID = '3849fabf-3934-47c3-a299-93e87e825680';
const stored: SecretBlob = {
	password: 'old-password',
	note: 'old note',
	fields: [{ label: 'PIN', value: '1111' }]
};
const STORED_KEY = 'projects/p/locations/l/keyRings/r/cryptoKeys/first';
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
		const row = { ciphertext, version: storedVersion, key_name: STORED_KEY };
		const result = Promise.resolve({ data: null, error: null });
		return Object.assign(result, {
			single: () => Promise.resolve({ data: row, error: null })
		});
	};
	const requestedKeys: (string | null)[] = [];
	const services = {
		supabase: { rpc },
		cipherFor: (keyName: string | null) => {
			requestedKeys.push(keyName);
			return Promise.resolve({ ...cipher, keyName });
		}
	} as unknown as EntryServices;

	const savedBlob = async () => {
		const saved = updates[0];
		if (!saved) return undefined;
		const aad = buildAad(ENTRY_ID, saved.p_secret_version as number);
		return parseBlob(await cipher.decrypt(saved.p_ciphertext as string, aad));
	};
	return { services, updates, savedBlob, requestedKeys };
}

function entryForm(fields: [label: string, value: string][]): FormData {
	const form = new FormData();
	form.set('title', 'Bank');
	form.set('password', 'pw');
	for (const [label, value] of fields) {
		form.append('fieldLabel', label);
		form.append('fieldValue', value);
	}
	return form;
}

const parseForm = (fields: [label: string, value: string][]) =>
	v.safeParse(entryInputSchema, readEntryForm(entryForm(fields)));

describe('readEntryForm', () => {
	it('drops rows left completely empty', () => {
		const parsed = parseForm([
			['', ''],
			['PIN', '1234']
		]);

		expect(parsed.success && parsed.output.fields).toEqual([{ label: 'PIN', value: '1234' }]);
	});

	it('refuses a value without a name instead of discarding it', () => {
		const parsed = parseForm([
			['PIN', '1234'],
			['  ', 'recovery-code']
		]);

		expect(parsed.success).toBe(false);
		expect(parsed.issues?.[0]?.message).toBe('Every secret field needs a name.');
	});

	it('keeps the line breaks of a field value', () => {
		const parsed = parseForm([['Backup codes', '1111-2222\n3333-4444']]);

		expect(parsed.success && parsed.output.fields[0]?.value).toBe('1111-2222\n3333-4444');
	});
});

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

	it('reads and rewrites an entry with the key recorded for it, and records it again', async () => {
		const { services, updates, requestedKeys } = await harness(2);

		await updateEntry(services, ENTRY_ID, { input, expectedVersion: 2, replaceSecrets: false });

		expect(requestedKeys).toEqual([STORED_KEY, STORED_KEY]);
		expect(updates[0]?.p_key_name).toBe(STORED_KEY);
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
