import { describe, expect, it } from 'vitest';
import { describeEvent } from './audit';

describe('describeEvent', () => {
	it('names the copied field and the entry', () => {
		const event = { action: 'secret.copy', entry_title: 'Bank', detail: { field: 'password' } };

		expect(describeEvent(event)).toBe('Copied password of “Bank”');
	});

	it('still reads well once the entry is gone', () => {
		expect(describeEvent({ action: 'entry.delete', entry_title: null, detail: {} })).toBe(
			'Deleted “deleted entry”'
		);
	});

	it('falls back to the raw action for an unknown event or malformed detail', () => {
		expect(describeEvent({ action: 'future.event', entry_title: null, detail: null })).toBe(
			'future.event'
		);
		expect(describeEvent({ action: 'member.add', entry_title: null, detail: [] })).toBe(
			'Added ? as ?'
		);
	});
});
