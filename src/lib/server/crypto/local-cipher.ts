import { CipherError, fromBase64, toBase64, type SecretCipher } from './cipher';

const IV_LENGTH = 12;

const copyBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(bytes);

/**
 * Development and test stand-in for Google KMS: the key sits in the environment, which is
 * exactly what production must never do. `resolveCipher` refuses it outside a local database.
 */
export async function createLocalCipher(base64Key: string): Promise<SecretCipher> {
	const rawKey = fromBase64(base64Key);
	if (rawKey.length !== 32) {
		throw new CipherError('unavailable', 'LOCAL_KMS_KEY must be 32 bytes, base64 encoded');
	}
	const key = await crypto.subtle.importKey('raw', copyBytes(rawKey), 'AES-GCM', false, [
		'encrypt',
		'decrypt'
	]);
	const additionalData = (aad: string) => new TextEncoder().encode(aad);

	return {
		async encrypt(plaintext, aad) {
			const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
			const sealed = await crypto.subtle.encrypt(
				{ name: 'AES-GCM', iv, additionalData: additionalData(aad) },
				key,
				copyBytes(plaintext)
			);
			return toBase64(new Uint8Array([...iv, ...new Uint8Array(sealed)]));
		},

		async decrypt(ciphertext, aad) {
			const bytes = fromBase64(ciphertext);
			try {
				const opened = await crypto.subtle.decrypt(
					{
						name: 'AES-GCM',
						iv: copyBytes(bytes.subarray(0, IV_LENGTH)),
						additionalData: additionalData(aad)
					},
					key,
					copyBytes(bytes.subarray(IV_LENGTH))
				);
				return new Uint8Array(opened);
			} catch {
				throw new CipherError('corrupt', 'Ciphertext does not match this entry');
			}
		}
	};
}
