import { redirect } from '@sveltejs/kit';
import { safeNextPath } from '#lib/server/google-session.ts';
import { settings } from '#lib/server/settings.ts';
import type { PageServerLoad } from './$types';

const ERRORS: Record<string, string> = {
	signin: 'Sign-in failed. Try again.',
	workspace: `Only ${settings.allowedGoogleDomain} Google Workspace accounts can sign in.`
};

export const load: PageServerLoad = ({ locals, url }) => {
	const hasGoogleToken = !settings.requiresGoogleToken || locals.googleAccessToken !== undefined;
	if (locals.user && hasGoogleToken) redirect(303, '/');

	return {
		next: safeNextPath(url.searchParams.get('next')),
		domain: settings.allowedGoogleDomain,
		localMode: settings.isLocalMode,
		error: ERRORS[url.searchParams.get('error') ?? '']
	};
};
