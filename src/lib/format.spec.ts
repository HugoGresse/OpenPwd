import { describe, expect, it } from 'vitest';
import { formatDate, generatePassword, safeExternalUrl } from './format';

describe('safeExternalUrl', () => {
	it('keeps http and https links', () => {
		expect(safeExternalUrl('https://bank.example/login')).toBe('https://bank.example/login');
	});

	it.each(['javascript:alert(1)', 'data:text/html,x', 'not a url', '', null])(
		'drops %s',
		(value) => {
			expect(safeExternalUrl(value)).toBeUndefined();
		}
	);
});

describe('generatePassword', () => {
	it('returns the requested length from the allowed alphabet', () => {
		expect(generatePassword(32)).toMatch(/^[A-Za-z0-9!#$%&*+\-=?@^_]{32}$/);
	});

	it('skips bytes that would bias the distribution', () => {
		const biased = (array: Uint8Array) => array.fill(255).fill(0, 1);

		expect(generatePassword(4, biased)).toBe('AAAA');
	});
});

describe('formatDate', () => {
	it('shows a dash for a missing date', () => {
		expect(formatDate(null)).toBe('—');
	});

	it('formats in UTC whatever the server time zone', () => {
		expect(formatDate('2026-11-26T10:05:00Z')).toBe('26 Nov 2026, 10:05 UTC');
	});
});
