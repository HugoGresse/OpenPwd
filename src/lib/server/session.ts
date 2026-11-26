import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { clearGoogleToken } from './google-session.ts';

function clearSessionCookies(cookies: Cookies): void {
	for (const { name } of cookies.getAll()) {
		if (name.startsWith('sb-')) cookies.delete(name, { path: '/' });
	}
	clearGoogleToken(cookies);
}

/**
 * Revokes every session of the member, not only this browser's: each Google re-authentication
 * leaves the previous session behind, and a copied cookie must not outlive a sign-out.
 *
 * Supabase keeps its cookies when the revocation request fails. A sign-out must never leave a
 * usable session behind, so every session cookie is removed whatever the outcome.
 */
export async function endSession(event: RequestEvent): Promise<void> {
	const { error } = await event.locals.supabase.auth
		.signOut({ scope: 'global' })
		.catch((cause: unknown) => ({ error: cause }));
	if (error) console.error('session revocation failed, cookies cleared anyway', { error });

	clearSessionCookies(event.cookies);
}
