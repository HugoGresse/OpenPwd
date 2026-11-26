import { error, redirect } from '@sveltejs/kit';
import { failWith, isUuid } from '#lib/server/forms.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!isUuid(params.entryId)) error(404, 'Password not found');

	const { data, error: queryError } = await locals.supabase
		.from('entries')
		.select(
			`id, title, url, username, field_labels, has_note, created_at, updated_at, last_accessed_at,
			editor:profiles!entries_updated_by_fkey(email),
			reader:profiles!entries_last_accessed_by_fkey(email)`
		)
		.eq('id', params.entryId)
		.eq('org_id', params.orgId)
		.maybeSingle();
	if (queryError) throw queryError;
	if (!data) error(404, 'Password not found');

	return { entry: data };
};

export const actions: Actions = {
	delete: async ({ locals, params }) => {
		const { error: deleteError } = await locals.supabase.rpc('delete_entry', {
			p_entry_id: params.entryId
		});
		if (deleteError) return failWith(deleteError, 'delete entry failed');

		redirect(303, `/orgs/${params.orgId}`);
	}
};
