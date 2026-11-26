import * as v from 'valibot';
import type { SecretCipher } from './crypto/cipher';
import {
	buildAad,
	describeSelector,
	fieldLabelsOf,
	parseBlob,
	selectSecret,
	serializeBlob,
	type SecretBlob,
	type SecretSelector
} from './crypto/secret-blob';
import { DomainError } from './failures';
import { formText } from './forms';
import type { AppSupabaseClient } from './supabase';

export interface EntryServices {
	supabase: AppSupabaseClient;
	cipherFor: (organizationKeyName: string | null) => Promise<SecretCipher>;
}

const text = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));

export const entryInputSchema = v.object({
	title: v.pipe(text(120), v.minLength(1, 'A title is required.')),
	url: v.union([v.literal(''), v.pipe(text(2048), v.url('The URL is not valid.'))]),
	username: text(320),
	password: v.pipe(v.string(), v.maxLength(1000)),
	note: v.pipe(v.string(), v.maxLength(10_000)),
	fields: v.pipe(
		v.array(v.object({ label: text(60), value: v.pipe(v.string(), v.maxLength(4000)) })),
		v.maxLength(30)
	)
});

export type EntryInput = v.InferOutput<typeof entryInputSchema>;

export function readEntryForm(form: FormData): unknown {
	const labels = form.getAll('fieldLabel').map(String);
	const values = form.getAll('fieldValue').map(String);
	return {
		title: formText(form, 'title'),
		url: formText(form, 'url'),
		username: formText(form, 'username'),
		password: formText(form, 'password'),
		note: formText(form, 'note'),
		fields: labels
			.map((label, index) => ({ label, value: values[index] ?? '' }))
			.filter((field) => field.label.trim() !== '')
	};
}

const toBlob = (input: EntryInput): SecretBlob => ({
	password: input.password,
	note: input.note,
	fields: input.fields
});

async function organizationKeyName(supabase: AppSupabaseClient, orgId: string) {
	const { data, error } = await supabase
		.from('organizations')
		.select('kms_key_name')
		.eq('id', orgId)
		.single();
	if (error) throw error;
	return data.kms_key_name;
}

export async function createEntry(
	services: EntryServices,
	orgId: string,
	input: EntryInput
): Promise<string> {
	const entryId = crypto.randomUUID();
	const blob = toBlob(input);
	const cipher = await services.cipherFor(await organizationKeyName(services.supabase, orgId));
	const ciphertext = await cipher.encrypt(serializeBlob(blob), buildAad(entryId, 1));

	const { error } = await services.supabase.rpc('create_entry', {
		p_entry_id: entryId,
		p_org_id: orgId,
		p_title: input.title,
		p_url: input.url,
		p_username: input.username,
		p_field_labels: fieldLabelsOf(blob),
		p_has_note: blob.note !== '',
		p_ciphertext: ciphertext
	});
	if (error) throw error;
	return entryId;
}

type SecretAccess = 'secret.view' | 'secret.copy' | 'secret.edit';

/** Writes the audit row first, then decrypts: no plaintext exists without its log line. */
async function openSecret(
	services: EntryServices,
	entryId: string,
	action: SecretAccess,
	auditedField: string
): Promise<{ blob: SecretBlob; version: number; keyName: string | null }> {
	const { data, error } = await services.supabase
		.rpc('reveal_entry', { p_entry_id: entryId, p_action: action, p_field: auditedField })
		.single();
	if (error) throw error;

	const cipher = await services.cipherFor(data.key_name);
	const plaintext = await cipher.decrypt(data.ciphertext, buildAad(entryId, data.version));
	return { blob: parseBlob(plaintext), version: data.version, keyName: data.key_name };
}

export async function revealSecret(
	services: EntryServices,
	entryId: string,
	selector: SecretSelector,
	action: 'secret.view' | 'secret.copy'
): Promise<string | undefined> {
	const { data: entry, error } = await services.supabase
		.from('entries')
		.select('field_labels')
		.eq('id', entryId)
		.maybeSingle();
	if (error) throw error;
	if (!entry) throw new DomainError('not_found');

	const auditedField = describeSelector(selector, entry.field_labels);
	const { blob } = await openSecret(services, entryId, action, auditedField);
	return selectSecret(blob, selector);
}

export interface EditableSecrets extends Pick<SecretBlob, 'note' | 'fields'> {
	version: number;
}

export async function loadSecretsForEdit(
	services: EntryServices,
	entryId: string
): Promise<EditableSecrets> {
	const opened = await openSecret(services, entryId, 'secret.edit', 'note and fields');
	return { note: opened.blob.note, fields: opened.blob.fields, version: opened.version };
}

export interface EntryUpdate {
	input: EntryInput;
	/** The secret version the form was opened on: a later change by someone else is a conflict. */
	expectedVersion: number;
	/** False while the note and fields were never unlocked in the form: they are kept as stored. */
	replaceSecrets: boolean;
}

/** An empty password in the form means "keep the current one": it is never sent to the browser. */
export async function updateEntry(
	services: EntryServices,
	entryId: string,
	{ input, expectedVersion, replaceSecrets }: EntryUpdate
): Promise<void> {
	const current = await openSecret(services, entryId, 'secret.edit', 'save');
	if (current.version !== expectedVersion) throw new DomainError('version_conflict');

	const blob: SecretBlob = {
		password: input.password || current.blob.password,
		note: replaceSecrets ? input.note : current.blob.note,
		fields: replaceSecrets ? input.fields : current.blob.fields
	};
	const nextVersion = current.version + 1;
	const cipher = await services.cipherFor(current.keyName);
	const ciphertext = await cipher.encrypt(serializeBlob(blob), buildAad(entryId, nextVersion));

	const { error } = await services.supabase.rpc('update_entry', {
		p_entry_id: entryId,
		p_title: input.title,
		p_url: input.url,
		p_username: input.username,
		p_field_labels: fieldLabelsOf(blob),
		p_has_note: blob.note !== '',
		p_ciphertext: ciphertext,
		p_secret_version: nextVersion
	});
	if (error) throw error;
}
