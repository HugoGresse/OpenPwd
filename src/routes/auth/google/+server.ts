import { error, redirect } from '@sveltejs/kit';
import { GOOGLE_SCOPES, safeNextPath } from '#lib/server/google-session.ts';
import { settings } from '#lib/server/settings.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	const next = safeNextPath(url.searchParams.get('next'));
	const callback = new URL('/auth/callback', url.origin);
	callback.searchParams.set('next', next);

	const { data, error: signInError } = await locals.supabase.auth.signInWithOAuth({
		provider: 'google',
		options: {
			redirectTo: callback.toString(),
			scopes: GOOGLE_SCOPES,
			queryParams: {
				hd: settings.allowedGoogleDomain,
				...(locals.user ? { login_hint: locals.user.email } : { prompt: 'select_account' })
			}
		}
	});
	if (signInError || !data.url) error(503, 'Google sign-in is unavailable.');

	redirect(303, data.url, { external: [settings.supabaseUrl] });
};
