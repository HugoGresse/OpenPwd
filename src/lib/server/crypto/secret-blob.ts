import * as v from 'valibot';

const fieldSchema = v.object({
	label: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
	value: v.pipe(v.string(), v.maxLength(4000))
});

const blobSchema = v.object({
	password: v.pipe(v.string(), v.maxLength(1000)),
	note: v.pipe(v.string(), v.maxLength(10_000)),
	fields: v.pipe(v.array(fieldSchema), v.maxLength(30))
});

export type SecretField = v.InferOutput<typeof fieldSchema>;
export type SecretBlob = v.InferOutput<typeof blobSchema>;

export type SecretSelector =
	{ kind: 'password' } | { kind: 'note' } | { kind: 'field'; index: number };

export const buildAad = (entryId: string, version: number): string =>
	`openpwd/entry/${entryId}/v${version}`;

export const serializeBlob = (blob: SecretBlob): Uint8Array =>
	new TextEncoder().encode(JSON.stringify(v.parse(blobSchema, blob)));

export const parseBlob = (bytes: Uint8Array): SecretBlob =>
	v.parse(blobSchema, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));

export function parseSelector(raw: string): SecretSelector | undefined {
	if (raw === 'password' || raw === 'note') return { kind: raw };
	const match = /^field:(\d{1,2})$/.exec(raw);
	return match ? { kind: 'field', index: Number(match[1]) } : undefined;
}

export function selectSecret(blob: SecretBlob, selector: SecretSelector): string | undefined {
	if (selector.kind === 'password') return blob.password;
	if (selector.kind === 'note') return blob.note;
	return blob.fields[selector.index]?.value;
}

export function describeSelector(selector: SecretSelector, fieldLabels: readonly string[]): string {
	if (selector.kind !== 'field') return selector.kind;
	return `field: ${fieldLabels[selector.index] ?? selector.index}`;
}

export const fieldLabelsOf = (blob: SecretBlob): string[] =>
	blob.fields.map((field) => field.label);
