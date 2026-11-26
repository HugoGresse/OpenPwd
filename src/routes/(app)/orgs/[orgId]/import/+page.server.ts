import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { parseImport } from '#lib/import.ts';
import { createEntry, entryInputSchema, type EntryInput } from '#lib/server/entries.ts';
import { entryServices } from '#lib/server/entry-services.ts';
import { toFailure } from '#lib/server/failures.ts';
import { firstIssue, formText } from '#lib/server/forms.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		const preview = parseImport(formText(await event.request.formData(), 'table'));
		if (preview.problem) return fail(400, { message: preview.problem });
		if (preview.rows.length === 0) return fail(400, { message: 'There is nothing to import.' });

		// Nothing is written unless every row is valid: a half-imported paste is hard to resume.
		const inputs: EntryInput[] = [];
		for (const row of preview.rows) {
			const input = row.problem ? undefined : v.safeParse(entryInputSchema, row);
			if (!input?.success) {
				const reason = row.problem ?? firstIssue(input?.issues ?? []);
				return fail(400, { message: `Line ${row.line}: ${reason}. Fix it and import again.` });
			}
			inputs.push(input.output);
		}

		const services = entryServices(event);
		let imported = 0;
		for (const input of inputs) {
			try {
				await createEntry(services, event.params.orgId, input);
				imported += 1;
			} catch (error) {
				const failure = toFailure(error);
				if (failure.status >= 500) console.error('import failed', { imported, error });
				return fail(failure.status, {
					message:
						`${failure.message} ${imported} of ${inputs.length} passwords were imported. ` +
						`Remove the first ${imported} rows before trying again.`
				});
			}
		}

		return { imported };
	}
};
