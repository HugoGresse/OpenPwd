import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import {
	entryInputSchema,
	loadSecretsForEdit,
	readEntryForm,
	updateEntry
} from '#lib/server/entries.ts';
import { entryServices } from '#lib/server/entry-services.ts';
import { toFailure } from '#lib/server/failures.ts';
import { failWith, firstIssue, isUuid } from '#lib/server/forms.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { params, locals } = event;
	if (!isUuid(params.entryId)) error(404, 'Password not found');

	const { data: entry, error: queryError } = await locals.supabase
		.from('entries')
		.select('id, title, url, username')
		.eq('id', params.entryId)
		.eq('org_id', params.orgId)
		.maybeSingle();
	if (queryError) throw queryError;
	if (!entry) error(404, 'Password not found');

	try {
		const secrets = await loadSecretsForEdit(entryServices(event), entry.id);
		return { entry: { ...entry, ...secrets } };
	} catch (cause) {
		const failure = toFailure(cause);
		if (failure.code === 'reauth_required') {
			redirect(303, `/auth/google?next=${encodeURIComponent(event.url.pathname)}`);
		}
		error(failure.status, failure.message);
	}
};

export const actions: Actions = {
	default: async (event) => {
		const input = v.safeParse(entryInputSchema, readEntryForm(await event.request.formData()));
		if (!input.success) return fail(400, { message: firstIssue(input.issues) });

		try {
			await updateEntry(entryServices(event), event.params.entryId, input.output);
		} catch (cause) {
			return failWith(cause, 'update entry failed');
		}
		redirect(303, `/orgs/${event.params.orgId}/entries/${event.params.entryId}`);
	}
};
