import { json } from '@sveltejs/kit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { stringify } from 'devalue';
import { readGoogleToken } from '#lib/server/google-session.ts';
import { isSessionCookie } from '#lib/server/session-cookies.ts';
import { settings } from '#lib/server/settings.ts';
import { createSupabaseClient, currentUser, sessionIsCurrent } from '#lib/server/supabase.ts';

const PUBLIC_PREFIXES = ['/login', '/auth/', '/healthz'];
const EXPIRED = 'Your session expired. Sign in again.';
const EXPIRED_WHILE_SUBMITTING =
	'Your session expired and nothing was saved. Open OpenPwd in another tab to sign in again, ' +
	'then submit this form once more.';

const SECURITY_HEADERS: Record<string, string> = {
	'strict-transport-security': 'max-age=63072000; includeSubDomains',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	// Not no-referrer: browsers then send `Origin: null` with form posts, which fail the CSRF check.
	'referrer-policy': 'same-origin',
	'cross-origin-opener-policy': 'same-origin',
	'cross-origin-resource-policy': 'same-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
	'cache-control': 'no-store'
};

// The Supabase client runs promises nobody awaits. One that rejects must not end the process.
const REJECTION_GUARD = Symbol.for('openpwd.rejection-guard');
const globals = globalThis as { [REJECTION_GUARD]?: boolean };
if (!globals[REJECTION_GUARD]) {
	globals[REJECTION_GUARD] = true;
	process.on('unhandledRejection', (reason) => {
		console.error('unhandled promise rejection', reason);
	});
}

const isPublic = (pathname: string): boolean =>
	PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));

/** A form submitted through `use:enhance`: it expects an action result, not a page. */
const isFormAction = (request: Request): boolean =>
	request.method === 'POST' && request.headers.get('x-sveltekit-action') === 'true';

const authenticate: Handle = async ({ event, resolve }) => {
	event.locals.supabase = await createSupabaseClient(event);
	event.locals.user = await currentUser(event.locals.supabase);
	event.locals.googleAccessToken = readGoogleToken(event.cookies);

	// Before the public pages too: the sign-in page sends a signed-in member back to the vault.
	if (event.locals.user && !(await sessionIsCurrent(event.locals.supabase))) {
		for (const { name } of event.cookies.getAll()) {
			if (isSessionCookie(name)) event.cookies.delete(name, { path: '/' });
		}
		event.locals.user = null;
	}

	const { pathname, search } = event.url;
	if (isPublic(pathname)) return resolve(event);

	const googleExpired = settings.requiresGoogleToken && !event.locals.googleAccessToken;
	if (event.locals.user && !googleExpired) return resolve(event);

	if (pathname.startsWith('/api/')) {
		return json({ code: 'reauth_required', message: EXPIRED }, { status: 401 });
	}
	// Following a redirect would replace the form, and what was typed in it, with an error page.
	if (isFormAction(event.request)) {
		const data = stringify({ code: 'reauth_required', message: EXPIRED_WHILE_SUBMITTING });
		return json({ type: 'failure', status: 401, data }, { status: 401 });
	}

	const next = encodeURIComponent(event.request.method === 'GET' ? pathname + search : '/');
	const location = event.locals.user ? `/auth/google?next=${next}` : `/login?next=${next}`;
	return new Response(null, { status: 303, headers: { location } });
};

const secureHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(name, value);
	}
	return response;
};

export const handle = sequence(secureHeaders, authenticate);
