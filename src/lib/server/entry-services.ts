import type { RequestEvent } from '@sveltejs/kit';
import { resolveCipher } from './crypto/resolve-cipher';
import type { EntryServices } from './entries';
import { cipherSettings } from './settings';

export const entryServices = (event: RequestEvent): EntryServices => ({
	supabase: event.locals.supabase,
	cipherFor: (keyName) =>
		resolveCipher(cipherSettings, {
			// The platform fetch, not event.fetch: nothing of this request may be forwarded to Google.
			fetch: globalThis.fetch,
			googleAccessToken: event.locals.googleAccessToken,
			organizationKeyName: keyName
		})
});
