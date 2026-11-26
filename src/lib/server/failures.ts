import { CipherError } from './crypto/cipher';

export interface Failure {
	status: number;
	code: string;
	message: string;
}

const DATABASE_FAILURES: Record<string, Failure> = {
	forbidden: { status: 403, code: 'forbidden', message: 'You are not allowed to do this.' },
	not_found: { status: 404, code: 'not_found', message: 'Not found.' },
	rate_limited: {
		status: 429,
		code: 'rate_limited',
		message: 'Too many secrets opened in a minute. Wait a moment and try again.'
	},
	version_conflict: {
		status: 409,
		code: 'version_conflict',
		message: 'Someone else changed this entry. Reload and try again.'
	},
	last_owner: {
		status: 409,
		code: 'last_owner',
		message: 'An organization must keep at least one owner.'
	}
};

const CIPHER_FAILURES: Record<CipherError['reason'], Failure> = {
	reauth_required: {
		status: 401,
		code: 'reauth_required',
		message: 'Your Google session expired. Sign in again.'
	},
	forbidden: {
		status: 403,
		code: 'kms_forbidden',
		message: 'Google refused access to the encryption key. Ask an admin to add you to its group.'
	},
	corrupt: { status: 500, code: 'corrupt', message: 'This secret could not be decrypted.' },
	unavailable: {
		status: 503,
		code: 'unavailable',
		message: 'The encryption service is unavailable.'
	}
};

export class DomainError extends Error {
	readonly code: string;

	constructor(code: 'not_found' | 'forbidden') {
		super(code);
		this.name = 'DomainError';
		this.code = code;
	}
}

const UNEXPECTED: Failure = { status: 500, code: 'unexpected', message: 'Something went wrong.' };

interface DatabaseError {
	code?: string;
	message?: string;
}

const isDatabaseError = (error: unknown): error is DatabaseError =>
	typeof error === 'object' && error !== null && 'message' in error && !(error instanceof Error);

export function toFailure(error: unknown): Failure {
	if (error instanceof CipherError) return CIPHER_FAILURES[error.reason];
	if (error instanceof DomainError) return DATABASE_FAILURES[error.code];
	if (isDatabaseError(error)) {
		if (error.message && Object.hasOwn(DATABASE_FAILURES, error.message)) {
			return DATABASE_FAILURES[error.message];
		}
		if (error.code === '42501') return DATABASE_FAILURES.forbidden;
		if (error.code === '23505') {
			return { status: 409, code: 'duplicate', message: 'This already exists.' };
		}
	}
	return UNEXPECTED;
}
