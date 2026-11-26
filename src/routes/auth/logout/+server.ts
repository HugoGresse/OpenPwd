import { redirect } from '@sveltejs/kit';
import { endSession } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	await endSession(event, 'local');
	redirect(303, '/login');
};
