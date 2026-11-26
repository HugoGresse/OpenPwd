import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/env';
import type { Database } from './database.types';
import { settings } from './settings';

export type AppSupabaseClient = SupabaseClient<Database>;

export const secureCookie = {
	path: '/',
	httpOnly: true,
	secure: !dev,
	sameSite: 'lax'
} as const;

const clientAddress = (event: RequestEvent): string => {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
};

/**
 * One client per request, acting as the signed-in member so that row-level security applies.
 * Session cookies are HTTP-only: no script in the browser ever holds the Supabase token.
 */
export function createSupabaseClient(event: RequestEvent): AppSupabaseClient {
	return createServerClient<Database>(settings.supabaseUrl, settings.supabasePublishableKey, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookies) => {
				for (const { name, value, options } of cookies) {
					event.cookies.set(name, value, { ...options, ...secureCookie });
				}
			}
		},
		global: {
			// The platform fetch: event.fetch would forward this request's cookies to a same-host API.
			fetch: globalThis.fetch,
			headers: {
				'x-openpwd-client-ip': clientAddress(event),
				'x-openpwd-user-agent': event.request.headers.get('user-agent') ?? ''
			}
		}
	});
}

export async function currentUser(supabase: AppSupabaseClient): Promise<App.Locals['user']> {
	const { data, error } = await supabase.auth.getClaims();
	const claims = data?.claims;
	if (error || !claims?.sub || typeof claims.email !== 'string') return null;
	return { id: claims.sub, email: claims.email };
}
