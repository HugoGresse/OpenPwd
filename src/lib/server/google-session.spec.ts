import { describe, expect, it } from 'vitest';
import { isWorkspaceSignIn, safeNextPath, type LinkedIdentity } from './google-session';

const workspace: LinkedIdentity = {
	provider: 'google',
	identity_data: { email: 'jo@Example.org', custom_claims: { hd: 'Example.org' } }
};
const personal: LinkedIdentity = {
	provider: 'google',
	identity_data: { email: 'jo@example.org' }
};

describe('isWorkspaceSignIn', () => {
	it('accepts a Workspace identity of the allowed domain, whatever the letter case', () => {
		expect(isWorkspaceSignIn([workspace], undefined, 'example.org')).toBe(true);
		expect(isWorkspaceSignIn([workspace], { hd: 'example.org' }, 'EXAMPLE.org')).toBe(true);
	});

	it('refuses a personal Google account on a company address', () => {
		expect(isWorkspaceSignIn([personal], { email_verified: true }, 'example.org')).toBe(false);
	});

	it('refuses when a personal account is linked next to the Workspace one', () => {
		expect(isWorkspaceSignIn([workspace, personal], undefined, 'example.org')).toBe(false);
	});

	it('refuses another Workspace domain', () => {
		const other = { provider: 'google', identity_data: { custom_claims: { hd: 'evil.org' } } };

		expect(isWorkspaceSignIn([other], undefined, 'example.org')).toBe(false);
	});

	it('refuses when there is no Google identity at all', () => {
		expect(isWorkspaceSignIn([], { hd: 'example.org' }, 'example.org')).toBe(false);
		expect(isWorkspaceSignIn([{ provider: 'email' }], undefined, 'example.org')).toBe(false);
	});

	it('lets the live Google answer veto, never approve', () => {
		expect(isWorkspaceSignIn([workspace], { hd: 'evil.org' }, 'example.org')).toBe(false);
		expect(isWorkspaceSignIn([workspace], { email_verified: false }, 'example.org')).toBe(false);
		expect(isWorkspaceSignIn([personal], { hd: 'example.org' }, 'example.org')).toBe(false);
	});

	it('ignores a malformed claims object', () => {
		const malformed = { provider: 'google', identity_data: { custom_claims: 'example.org' } };

		expect(isWorkspaceSignIn([malformed], undefined, 'example.org')).toBe(false);
	});
});

describe('safeNextPath', () => {
	it.each(['/orgs/1', '/orgs/1/audit?group=secrets'])('keeps the local path %s', (path) => {
		expect(safeNextPath(path)).toBe(path);
	});

	it.each([null, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'orgs'])(
		'falls back to the home page for %s',
		(path) => {
			expect(safeNextPath(path)).toBe('/');
		}
	);
});
