import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { data, error } = await locals.supabase
		.from('entries')
		.select('id, title, url, username, updated_at, last_accessed_at')
		.eq('org_id', params.orgId)
		.order('title');
	if (error) throw error;

	return { entries: data };
};
