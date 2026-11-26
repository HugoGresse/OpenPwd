import { defineEnvVars } from '@sveltejs/kit/env';

const required = (name: string) => (value: string | undefined) => {
	if (!value) throw new Error(`${name} must be set`);
	return value;
};

const optional = (value: string | undefined) => value || undefined;

export const variables = defineEnvVars({
	SUPABASE_URL: {
		schema: (value) => new URL(required('SUPABASE_URL')(value)).origin,
		description: 'Base URL of the Supabase project'
	},
	SUPABASE_PUBLISHABLE_KEY: {
		schema: required('SUPABASE_PUBLISHABLE_KEY'),
		description: 'Publishable (anon) key. Never the secret or service-role key.'
	},
	ALLOWED_GOOGLE_DOMAIN: {
		schema: (value) => required('ALLOWED_GOOGLE_DOMAIN')(value).toLowerCase(),
		description: 'Google Workspace domain whose members may sign in'
	},
	KMS_MODE: {
		schema: (value): 'google' | 'local' => {
			if (value !== 'google' && value !== 'local') {
				throw new Error('KMS_MODE must be "google" or "local"');
			}
			return value;
		},
		description: '"google" in production. "local" is refused unless Supabase runs on localhost.'
	},
	KMS_KEY_NAME: {
		schema: optional,
		description: 'Default Cloud KMS crypto key resource name'
	},
	LOCAL_KMS_KEY: {
		schema: optional,
		description: 'Local development only: 32 random bytes, base64'
	},
	DEV_LOGIN_PASSWORD: {
		schema: optional,
		description: 'Local development only: password of the throwaway dev accounts'
	}
});
