const dateFormat = new Intl.DateTimeFormat('en-GB', {
	dateStyle: 'medium',
	timeStyle: 'short',
	timeZone: 'UTC'
});

export const formatDate = (value: string | null | undefined): string =>
	value ? `${dateFormat.format(new Date(value))} UTC` : '—';

export function safeExternalUrl(value: string | null | undefined): string | undefined {
	if (!value || !URL.canParse(value)) return undefined;
	const { protocol } = new URL(value);
	return protocol === 'https:' || protocol === 'http:' ? value : undefined;
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%&*+-=?@^_';

type RandomSource = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array;

const systemRandom: RandomSource = (bytes) => crypto.getRandomValues(bytes);

/** Rejection sampling keeps every character equally likely. */
export function generatePassword(length = 24, random: RandomSource = systemRandom): string {
	const limit = 256 - (256 % PASSWORD_ALPHABET.length);
	let password = '';
	while (password.length < length) {
		for (const byte of random(new Uint8Array(length))) {
			if (byte < limit && password.length < length) {
				password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
			}
		}
	}
	return password;
}
