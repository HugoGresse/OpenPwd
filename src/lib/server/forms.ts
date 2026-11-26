import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { toFailure } from './failures';

const uuidSchema = v.pipe(v.string(), v.uuid());

export function formText(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}

export const isUuid = (value: string): boolean => v.is(uuidSchema, value);

export function failWith(error: unknown, context: string) {
	const failure = toFailure(error);
	if (failure.status >= 500) console.error(context, error);
	return fail(failure.status, { message: failure.message, code: failure.code });
}

export const firstIssue = (issues: readonly v.BaseIssue<unknown>[]): string =>
	issues[0]?.message ?? 'The form is not valid.';
