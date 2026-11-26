import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { failWith, firstIssue, formText } from '#lib/server/forms.ts';
import type { Actions, PageServerLoad } from './$types';

const roleSchema = v.picklist(['owner', 'admin', 'member'], 'Pick a valid role.');
const addSchema = v.object({
	email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email('Enter a valid email address.')),
	role: roleSchema
});
const memberSchema = v.object({ userId: v.pipe(v.string(), v.uuid()) });

const formObject = async (request: Request) => Object.fromEntries(await request.formData());

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { canManage } = await parent();
	const [members, invites] = await Promise.all([
		locals.supabase
			.from('organization_members')
			.select(
				'user_id, role, created_at, profile:profiles!organization_members_user_id_fkey(email)'
			)
			.eq('org_id', params.orgId)
			.order('created_at'),
		canManage
			? locals.supabase
					.from('organization_invites')
					.select('email, role, created_at')
					.eq('org_id', params.orgId)
					.order('created_at')
			: { data: [], error: null }
	]);
	if (members.error) throw members.error;
	if (invites.error) throw invites.error;

	return { members: members.data, invites: invites.data };
};

export const actions: Actions = {
	add: async ({ locals, params, request }) => {
		const input = v.safeParse(addSchema, await formObject(request));
		if (!input.success) return fail(400, { message: firstIssue(input.issues) });

		const { data, error } = await locals.supabase.rpc('add_member', {
			p_org_id: params.orgId,
			p_email: input.output.email,
			p_role: input.output.role
		});
		if (error) return failWith(error, 'add_member failed');

		return {
			notice:
				data === 'invited'
					? `${input.output.email} has not signed in yet. Access starts at their first sign-in.`
					: `${input.output.email} was added.`
		};
	},

	role: async ({ locals, params, request }) => {
		const input = v.safeParse(
			v.object({ ...memberSchema.entries, role: roleSchema }),
			await formObject(request)
		);
		if (!input.success) return fail(400, { message: firstIssue(input.issues) });

		const { error } = await locals.supabase.rpc('set_member_role', {
			p_org_id: params.orgId,
			p_user_id: input.output.userId,
			p_role: input.output.role
		});
		if (error) return failWith(error, 'set_member_role failed');
	},

	remove: async ({ locals, params, request }) => {
		const input = v.safeParse(memberSchema, await formObject(request));
		if (!input.success) return fail(400, { message: firstIssue(input.issues) });

		const { error } = await locals.supabase.rpc('remove_member', {
			p_org_id: params.orgId,
			p_user_id: input.output.userId
		});
		if (error) return failWith(error, 'remove_member failed');
	},

	removeInvite: async ({ locals, params, request }) => {
		const email = formText(await request.formData(), 'email');
		const { error } = await locals.supabase.rpc('remove_invite', {
			p_org_id: params.orgId,
			p_email: email
		});
		if (error) return failWith(error, 'remove_invite failed');
	}
};
