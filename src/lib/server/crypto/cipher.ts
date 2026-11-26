export type CipherFailure = 'reauth_required' | 'forbidden' | 'corrupt' | 'unavailable';

export class CipherError extends Error {
	readonly reason: CipherFailure;

	constructor(reason: CipherFailure, message: string) {
		super(message);
		this.name = 'CipherError';
		this.reason = reason;
	}
}

export interface SecretCipher {
	/** The KMS key behind this cipher, stored with what it encrypts. Null for the local stand-in. */
	readonly keyName: string | null;
	encrypt(plaintext: Uint8Array, aad: string): Promise<string>;
	decrypt(ciphertext: string, aad: string): Promise<Uint8Array>;
}

export const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

export const fromBase64 = (value: string): Uint8Array =>
	new Uint8Array(Buffer.from(value, 'base64'));
