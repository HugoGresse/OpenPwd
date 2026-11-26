import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { createEntry, entryInputSchema, readEntryForm } from '#lib/server/entries.ts';
import { entryServices } from '#lib/server/entry-services.ts';
import { failWith, firstIssue } from '#lib/server/forms.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		const input = v.safeParse(entryInputSchema, readEntryForm(await event.request.formData()));
		if (!input.success) return fail(400, { message: firstIssue(input.issues) });
		if (input.output.password === '') return fail(400, { message: 'A password is required.' });

		let entryId: string;
		try {
			entryId = await createEntry(entryServices(event), event.params.orgId, input.output);
		} catch (error) {
			return failWith(error, 'create entry failed');
		}
		redirect(303, `/orgs/${event.params.orgId}/entries/${entryId}`);
	}
};
