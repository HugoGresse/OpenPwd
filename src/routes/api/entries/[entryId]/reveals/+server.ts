import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import { parseSelector } from '#lib/server/crypto/secret-blob.ts';
import { loadSecretsForEdit, revealSecret } from '#lib/server/entries.ts';
import { entryServices } from '#lib/server/entry-services.ts';
import { toFailure } from '#lib/server/failures.ts';
import { isUuid } from '#lib/server/forms.ts';
import type { RequestHandler } from './$types';

const requestSchema = v.variant('purpose', [
	v.object({ purpose: v.picklist(['view', 'copy']), field: v.string() }),
	v.object({ purpose: v.literal('edit') })
]);

const refuse = (status: number, code: string, message: string) =>
	json({ code, message }, { status });

/**
 * Records one access to an entry's secrets and returns what was asked for, and nothing else:
 * one value to view or copy, or the note and fields to edit. Never the password for editing.
 */
export const POST: RequestHandler = async (event) => {
	if (event.request.headers.get('origin') !== event.url.origin) {
		return refuse(403, 'forbidden', 'Cross-site requests are not allowed.');
	}

	const { entryId } = event.params;
	const body = v.safeParse(requestSchema, await event.request.json().catch(() => undefined));
	if (!body.success || !isUuid(entryId)) {
		return refuse(400, 'invalid_request', 'The request is not valid.');
	}

	try {
		const services = entryServices(event);
		if (body.output.purpose === 'edit') return json(await loadSecretsForEdit(services, entryId));

		const selector = parseSelector(body.output.field);
		if (!selector) return refuse(400, 'invalid_request', 'The request is not valid.');

		const value = await revealSecret(services, entryId, selector, `secret.${body.output.purpose}`);
		if (value === undefined) return refuse(404, 'not_found', 'Not found.');
		return json({ value });
	} catch (error) {
		const failure = toFailure(error);
		if (failure.status >= 500) console.error('reveal failed', { entryId, error });
		return refuse(failure.status, failure.code, failure.message);
	}
};
