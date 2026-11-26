import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { entryInputSchema, readEntryForm, updateEntry } from '#lib/server/entries.ts';
import { entryServices } from '#lib/server/entry-services.ts';
import { failWith, firstIssue, formText, isUuid } from '#lib/server/forms.ts';
import type { Actions, PageServerLoad } from './$types';

/** Loads metadata only. Decrypting here would let a link, or a hover preload, open a secret. */
export const load: PageServerLoad = async ({ params, locals }) => {
	if (!isUuid(params.entryId)) error(404, 'Password not found');

	const { data: entry, error: queryError } = await locals.supabase
		.from('entries')
		.select('id, title, url, username, secret_version, has_note, field_labels')
		.eq('id', params.entryId)
		.eq('org_id', params.orgId)
		.maybeSingle();
	if (queryError) throw queryError;
	if (!entry) error(404, 'Password not found');

	return {
		entry: {
			id: entry.id,
			title: entry.title,
			url: entry.url ?? '',
			username: entry.username ?? '',
			version: entry.secret_version,
			hasSecrets: entry.has_note || entry.field_labels.length > 0
		}
	};
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const input = v.safeParse(entryInputSchema, readEntryForm(form));
		const expectedVersion = Number(formText(form, 'version'));
		if (!input.success) return fail(400, { message: firstIssue(input.issues) });
		if (!Number.isInteger(expectedVersion)) return fail(400, { message: 'Reload the page.' });

		try {
			await updateEntry(entryServices(event), event.params.entryId, {
				input: input.output,
				expectedVersion,
				replaceSecrets: formText(form, 'secretsUnlocked') === 'true'
			});
		} catch (cause) {
			return failWith(cause, 'update entry failed');
		}
		redirect(303, `/orgs/${event.params.orgId}/entries/${event.params.entryId}`);
	}
};
