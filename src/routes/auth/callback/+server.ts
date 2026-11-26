import { redirect } from '@sveltejs/kit';
import {
	belongsToWorkspace,
	clearGoogleToken,
	fetchGoogleIdentity,
	safeNextPath,
	storeGoogleToken
} from '#lib/server/google-session.ts';
import { settings } from '#lib/server/settings.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url, cookies }) => {
	const code = url.searchParams.get('code');
	if (!code) redirect(303, '/login?error=signin');

	const { data, error } = await locals.supabase.auth.exchangeCodeForSession(code);
	const googleToken = data.session?.provider_token;
	if (error || !googleToken) redirect(303, '/login?error=signin');

	const identity = await fetchGoogleIdentity(globalThis.fetch, googleToken);
	if (!identity || !belongsToWorkspace(identity, settings.allowedGoogleDomain)) {
		await locals.supabase.auth.signOut();
		clearGoogleToken(cookies);
		redirect(303, '/login?error=workspace');
	}

	storeGoogleToken(cookies, googleToken);
	redirect(303, safeNextPath(url.searchParams.get('next')));
};
