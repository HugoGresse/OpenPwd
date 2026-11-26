import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import { parseSelector } from '#lib/server/crypto/secret-blob.ts';
import { revealSecret } from '#lib/server/entries.ts';
import { entryServices } from '#lib/server/entry-services.ts';
import { toFailure } from '#lib/server/failures.ts';
import type { RequestHandler } from './$types';

const requestSchema = v.object({
	field: v.string(),
	purpose: v.picklist(['view', 'copy'])
});

const refuse = (status: number, code: string, message: string) =>
	json({ code, message }, { status });

/** Records one access to one secret value and returns that value, and nothing else. */
export const POST: RequestHandler = async (event) => {
	if (event.request.headers.get('origin') !== event.url.origin) {
		return refuse(403, 'forbidden', 'Cross-site requests are not allowed.');
	}

	const body = v.safeParse(requestSchema, await event.request.json().catch(() => undefined));
	const selector = body.success ? parseSelector(body.output.field) : undefined;
	if (!body.success || !selector || !v.is(v.pipe(v.string(), v.uuid()), event.params.entryId)) {
		return refuse(400, 'invalid_request', 'The request is not valid.');
	}

	try {
		const value = await revealSecret(
			entryServices(event),
			event.params.entryId,
			selector,
			`secret.${body.output.purpose}`
		);
		if (value === undefined) return refuse(404, 'not_found', 'Not found.');
		return json({ value });
	} catch (error) {
		const failure = toFailure(error);
		if (failure.status >= 500)
			console.error('reveal failed', { entryId: event.params.entryId, error });
		return refuse(failure.status, failure.code, failure.message);
	}
};
