import { fail, redirect } from '@sveltejs/kit';
import { failWith, formText } from '#lib/server/forms.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { data, error } = await locals.supabase
		.from('organization_members')
		.select('role, organizations(id, name)')
		.eq('user_id', locals.user?.id ?? '')
		.order('created_at');
	if (error) throw error;

	return {
		organizations: data.map((membership) => ({
			...membership.organizations,
			role: membership.role
		}))
	};
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const name = formText(await request.formData(), 'name').trim();
		if (name.length < 1 || name.length > 80) {
			return fail(400, { message: 'Give the organization a name of 1 to 80 characters.' });
		}

		const { data: orgId, error } = await locals.supabase.rpc('create_organization', {
			p_name: name
		});
		if (error) return failWith(error, 'create_organization failed');

		redirect(303, `/orgs/${orgId}`);
	}
};
