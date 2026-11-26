import { error, redirect } from '@sveltejs/kit';
import { formText } from '#lib/server/forms.ts';
import { settings } from '#lib/server/settings.ts';
import type { RequestHandler } from './$types';

/** Throwaway accounts for local development. The route does not exist outside local mode. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const password = settings.devLoginPassword;
	if (!settings.isLocalMode || !password) error(404, 'Not found');

	const form = await request.formData();
	const name = formText(form, 'name').trim().toLowerCase();
	if (!/^[a-z0-9.-]{1,40}$/.test(name)) redirect(303, '/login?error=signin');

	const credentials = { email: `${name}@${settings.allowedGoogleDomain}`, password };
	const signIn = await locals.supabase.auth.signInWithPassword(credentials);
	if (signIn.error) {
		const signUp = await locals.supabase.auth.signUp({
			...credentials,
			options: { data: { full_name: name } }
		});
		if (signUp.error || !signUp.data.session) redirect(303, '/login?error=signin');
	}

	redirect(303, '/');
};
