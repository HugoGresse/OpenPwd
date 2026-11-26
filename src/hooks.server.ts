import { json } from '@sveltejs/kit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { readGoogleToken } from '#lib/server/google-session.ts';
import { settings } from '#lib/server/settings.ts';
import { createSupabaseClient, currentUser } from '#lib/server/supabase.ts';

const PUBLIC_PREFIXES = ['/login', '/auth/', '/healthz'];

const SECURITY_HEADERS: Record<string, string> = {
	'strict-transport-security': 'max-age=63072000; includeSubDomains',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'referrer-policy': 'no-referrer',
	'cross-origin-opener-policy': 'same-origin',
	'cross-origin-resource-policy': 'same-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
	'cache-control': 'no-store'
};

const isPublic = (pathname: string): boolean =>
	PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));

const authenticate: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createSupabaseClient(event);
	event.locals.user = await currentUser(event.locals.supabase);
	event.locals.googleAccessToken = readGoogleToken(event.cookies);

	const { pathname, search } = event.url;
	if (isPublic(pathname)) return resolve(event);

	const isApi = pathname.startsWith('/api/');
	const googleExpired = settings.requiresGoogleToken && !event.locals.googleAccessToken;

	if (!event.locals.user || googleExpired) {
		if (isApi) {
			return json(
				{ code: 'reauth_required', message: 'Your session expired. Sign in again.' },
				{ status: 401 }
			);
		}
		const next = encodeURIComponent(event.request.method === 'GET' ? pathname + search : '/');
		const location = event.locals.user ? `/auth/google?next=${next}` : `/login?next=${next}`;
		return new Response(null, { status: 303, headers: { location } });
	}

	return resolve(event);
};

const secureHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(name, value);
	}
	return response;
};

export const handle = sequence(secureHeaders, authenticate);
