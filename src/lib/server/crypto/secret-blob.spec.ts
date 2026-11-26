import { describe, expect, it } from 'vitest';
import {
	buildAad,
	describeSelector,
	parseBlob,
	parseSelector,
	selectSecret,
	serializeBlob,
	type SecretBlob
} from './secret-blob';

const blob: SecretBlob = {
	password: 'pä$$w0rd',
	note: 'second line\nof the note',
	fields: [
		{ label: 'PIN', value: '1234' },
		{ label: 'Recovery code', value: 'abcd-efgh' }
	]
};

describe('secret blob', () => {
	it('survives a serialise and parse round trip, including non-ASCII characters', () => {
		expect(parseBlob(serializeBlob(blob))).toEqual(blob);
	});

	it('rejects a blob whose shape is wrong', () => {
		const bytes = new TextEncoder().encode(JSON.stringify({ password: 42 }));
		expect(() => parseBlob(bytes)).toThrow();
	});

	it('refuses to serialise more fields than the database accepts', () => {
		const fields = Array.from({ length: 31 }, (_, index) => ({ label: `f${index}`, value: '' }));
		expect(() => serializeBlob({ ...blob, fields })).toThrow();
	});

	it('binds the entry and its version into the authenticated data', () => {
		expect(buildAad('abc', 3)).toBe('openpwd/entry/abc/v3');
		expect(buildAad('abc', 3)).not.toBe(buildAad('abc', 4));
	});
});

describe('secret selector', () => {
	it.each([
		['password', { kind: 'password' }],
		['note', { kind: 'note' }],
		['field:0', { kind: 'field', index: 0 }],
		['field:12', { kind: 'field', index: 12 }]
	])('parses %s', (raw, expected) => {
		expect(parseSelector(raw)).toEqual(expected);
	});

	it.each(['', 'fields', 'field:', 'field:-1', 'field:1.5', 'field:999', '__proto__'])(
		'rejects %s',
		(raw) => {
			expect(parseSelector(raw)).toBeUndefined();
		}
	);

	it('returns only the selected value', () => {
		expect(selectSecret(blob, { kind: 'password' })).toBe('pä$$w0rd');
		expect(selectSecret(blob, { kind: 'field', index: 1 })).toBe('abcd-efgh');
		expect(selectSecret(blob, { kind: 'field', index: 7 })).toBeUndefined();
	});

	it('names the field for the audit log', () => {
		expect(describeSelector({ kind: 'note' }, [])).toBe('note');
		expect(describeSelector({ kind: 'field', index: 0 }, ['PIN'])).toBe('field: PIN');
		expect(describeSelector({ kind: 'field', index: 4 }, ['PIN'])).toBe('field: 4');
	});
});
