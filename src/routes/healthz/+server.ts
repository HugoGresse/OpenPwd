import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Healthy only when the database answers through the API, not merely when the process is up. */
export const GET: RequestHandler = async ({ locals }) => {
	const { data, error } = await locals.supabase.rpc('health');
	const healthy = !error && data === true;
	return json({ status: healthy ? 'ok' : 'unavailable' }, { status: healthy ? 200 : 503 });
};
