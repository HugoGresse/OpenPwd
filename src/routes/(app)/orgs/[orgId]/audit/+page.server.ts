import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;
const ACTION_GROUPS: Record<string, string> = {
	secrets: 'secret.%',
	entries: 'entry.%',
	members: 'member.%'
};

export const load: PageServerLoad = async ({ locals, params, parent, url }) => {
	const { canManage } = await parent();
	if (!canManage) error(403, 'Only owners and admins can read the audit log.');

	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const group = url.searchParams.get('group') ?? '';
	const from = (page - 1) * PAGE_SIZE;

	let query = locals.supabase
		.from('audit_log')
		.select('id, created_at, actor_email, action, entry_id, entry_title, detail, client_ip', {
			count: 'exact'
		})
		.eq('org_id', params.orgId)
		.order('id', { ascending: false })
		.range(from, from + PAGE_SIZE - 1);
	if (Object.hasOwn(ACTION_GROUPS, group)) query = query.like('action', ACTION_GROUPS[group]);

	const { data, count, error: queryError } = await query;
	if (queryError) throw queryError;

	return {
		events: data,
		page,
		group,
		pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))
	};
};
