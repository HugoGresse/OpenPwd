import type { RequestEvent } from '@sveltejs/kit';
import { clearGoogleToken } from './google-session.ts';

/**
 * Supabase keeps its cookies when the revocation request fails. A sign-out must never leave a
 * usable session behind, so every session cookie is removed whatever the outcome.
 */
export async function endSession(event: RequestEvent, scope: 'local' | 'global'): Promise<void> {
	const { error } = await event.locals.supabase.auth.signOut({ scope }).catch((cause: unknown) => ({
		error: cause
	}));
	if (error) console.error('session revocation failed, cookies cleared anyway', { error });

	for (const { name } of event.cookies.getAll()) {
		if (name.startsWith('sb-')) event.cookies.delete(name, { path: '/' });
	}
	clearGoogleToken(event.cookies);
}
