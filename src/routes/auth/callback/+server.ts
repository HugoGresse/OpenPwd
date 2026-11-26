import { redirect } from '@sveltejs/kit';
import {
	fetchGoogleIdentity,
	isWorkspaceSignIn,
	safeNextPath,
	storeGoogleToken
} from '#lib/server/google-session.ts';
import { endSession } from '#lib/server/session.ts';
import { settings } from '#lib/server/settings.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const { locals, url, cookies } = event;
	const code = url.searchParams.get('code');
	if (!code) redirect(303, '/login?error=signin');

	const { data, error } = await locals.supabase.auth.exchangeCodeForSession(code);
	const googleToken = data.session?.provider_token;
	if (error || !googleToken) redirect(303, '/login?error=signin');

	const identities =
		data.user?.identities ?? (await locals.supabase.auth.getUserIdentities()).data?.identities;
	const userinfo = await fetchGoogleIdentity(globalThis.fetch, googleToken);
	if (!isWorkspaceSignIn(identities ?? [], userinfo, settings.allowedGoogleDomain)) {
		await endSession(event, 'global');
		redirect(303, '/login?error=workspace');
	}

	storeGoogleToken(cookies, googleToken);
	redirect(303, safeNextPath(url.searchParams.get('next')));
};
