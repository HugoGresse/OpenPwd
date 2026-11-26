export const CLIPBOARD_EXPOSURE_MS = 30_000;
const GIVE_UP_AFTER_MS = 2 * 60_000;
const RETRY_EVENTS = ['focus', 'pointerdown', 'keydown'] as const;

// One pending clear for the whole page, outside any component: leaving the entry must not
// cancel it, and a newer copy must replace it instead of being wiped by the older timer.
let timer: ReturnType<typeof setTimeout> | undefined;
let deadline = 0;

async function emptyClipboard(): Promise<boolean> {
	try {
		await navigator.clipboard.writeText('');
		return true;
	} catch {
		return false;
	}
}

function stopRetrying(): void {
	for (const type of RETRY_EVENTS) window.removeEventListener(type, retry, true);
}

function retry(): void {
	if (Date.now() > deadline) return stopRetrying();
	void emptyClipboard().then((emptied) => {
		if (!emptied) return;
		stopRetrying();
		deadline = 0;
	});
}

const hasPendingClear = (): boolean => Date.now() < deadline;

/**
 * For the moments this page is about to go away (sign-out, reload): the timer would die with
 * it, so what was copied is cleared right away, while the browser still allows it.
 */
export function clearClipboardNow(): void {
	if (!hasPendingClear()) return;
	clearTimeout(timer);
	stopRetrying();
	deadline = 0;
	void emptyClipboard();
}

/**
 * Browsers refuse a clipboard write from a tab that is not in front (Chromium) or without a
 * recent click or key press (Firefox, Safari), which is the normal state 30 seconds after a
 * copy. A refused clear is retried when the member comes back, for a limited time: later than
 * that, the clipboard most likely holds something else.
 */
export function scheduleClipboardClear(): void {
	clearTimeout(timer);
	stopRetrying();
	deadline = Date.now() + CLIPBOARD_EXPOSURE_MS + GIVE_UP_AFTER_MS;
	timer = setTimeout(() => {
		void emptyClipboard().then((emptied) => {
			if (emptied) deadline = 0;
			else for (const type of RETRY_EVENTS) window.addEventListener(type, retry, true);
		});
	}, CLIPBOARD_EXPOSURE_MS);
}
