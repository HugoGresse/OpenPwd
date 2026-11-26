import { error } from '@sveltejs/kit';
import { isUuid } from '#lib/server/forms.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	if (!isUuid(params.orgId)) error(404, 'Organization not found');

	const [organization, membership] = await Promise.all([
		locals.supabase.from('organizations').select('id, name').eq('id', params.orgId).maybeSingle(),
		locals.supabase
			.from('organization_members')
			.select('role')
			.eq('org_id', params.orgId)
			.eq('user_id', locals.user?.id ?? '')
			.maybeSingle()
	]);
	if (organization.error) throw organization.error;
	if (membership.error) throw membership.error;
	if (!organization.data || !membership.data) error(404, 'Organization not found');

	const role = membership.data.role;
	return { organization: organization.data, role, canManage: role !== 'member' };
};
