import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/env';
import type { Database } from './database.types';
import { malformedSessionCookies, SESSION_COOKIE } from './session-cookies';
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
export async function createSupabaseClient(event: RequestEvent): Promise<AppSupabaseClient> {
	for (const name of await malformedSessionCookies(event.cookies.getAll())) {
		event.cookies.delete(name, { path: '/' });
	}

	return createServerClient<Database>(settings.supabaseUrl, settings.supabasePublishableKey, {
		cookieOptions: { name: SESSION_COOKIE },
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

/** A token the client cannot read makes it throw rather than report an error: nobody is signed in. */
export async function currentUser(supabase: AppSupabaseClient): Promise<App.Locals['user']> {
	const { data, error } = await supabase.auth
		.getClaims()
		.catch((cause: unknown) => ({ data: null, error: cause }));
	const claims = data?.claims;
	if (error || !claims?.sub || typeof claims.email !== 'string') return null;
	return { id: claims.sub, email: claims.email };
}

/**
 * The database refuses a session that was signed out, is too old or was not opened through
 * Google, while its token still verifies. Asking it keeps the pages from showing an empty
 * vault to someone who looks signed in. An unreachable database is not a verdict.
 */
export async function sessionIsCurrent(supabase: AppSupabaseClient): Promise<boolean> {
	const { data, error } = await supabase.rpc('session_is_current');
	return error !== null || data !== false;
}
