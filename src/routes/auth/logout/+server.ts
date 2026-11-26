import { redirect } from '@sveltejs/kit';
import { clearGoogleToken } from '#lib/server/google-session.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	await locals.supabase.auth.signOut();
	clearGoogleToken(cookies);
	redirect(303, '/login');
};
