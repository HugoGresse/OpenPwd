import { CipherError, fromBase64, toBase64, type CipherFailure, type SecretCipher } from './cipher';

const KMS_ENDPOINT = 'https://cloudkms.googleapis.com/v1';
const KEY_NAME_PATTERN =
	/^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/keyRings\/[\w-]+\/cryptoKeys\/[\w-]+$/;

export interface GoogleKmsOptions {
	fetch: typeof globalThis.fetch;
	keyName: string;
	/** The signed-in member's own Google access token: KMS authorises them, not this server. */
	accessToken: string;
}

interface KmsErrorBody {
	error?: { status?: string; details?: { reason?: string }[] };
}

export const isValidKeyName = (keyName: string): boolean => KEY_NAME_PATTERN.test(keyName);

export function classifyKmsFailure(status: number, body: KmsErrorBody): CipherFailure {
	const reasons = body.error?.details?.map((detail) => detail.reason) ?? [];
	if (status === 401 || reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
		return 'reauth_required';
	}
	if (status === 403) return 'forbidden';
	if (status === 400) return 'corrupt';
	return 'unavailable';
}

async function callKms(
	options: GoogleKmsOptions,
	operation: 'encrypt' | 'decrypt',
	payload: Record<string, string>
): Promise<Record<string, unknown>> {
	if (!isValidKeyName(options.keyName)) {
		throw new CipherError('unavailable', 'KMS key name is not a valid crypto key resource');
	}

	let response: Response;
	try {
		response = await options.fetch(`${KMS_ENDPOINT}/${options.keyName}:${operation}`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${options.accessToken}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(10_000)
		});
	} catch (cause) {
		throw new CipherError('unavailable', `KMS ${operation} request failed: ${String(cause)}`);
	}

	const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
	if (!response.ok) {
		const reason = classifyKmsFailure(response.status, body);
		throw new CipherError(reason, `KMS ${operation} refused with HTTP ${response.status}`);
	}
	return body;
}

export function createGoogleKmsCipher(options: GoogleKmsOptions): SecretCipher {
	return {
		async encrypt(plaintext, aad) {
			const body = await callKms(options, 'encrypt', {
				plaintext: toBase64(plaintext),
				additionalAuthenticatedData: toBase64(new TextEncoder().encode(aad))
			});
			if (typeof body.ciphertext !== 'string') {
				throw new CipherError('unavailable', 'KMS encrypt returned no ciphertext');
			}
			return body.ciphertext;
		},

		async decrypt(ciphertext, aad) {
			const body = await callKms(options, 'decrypt', {
				ciphertext,
				additionalAuthenticatedData: toBase64(new TextEncoder().encode(aad))
			});
			// KMS omits the field entirely when the plaintext is empty.
			return fromBase64(typeof body.plaintext === 'string' ? body.plaintext : '');
		}
	};
}
