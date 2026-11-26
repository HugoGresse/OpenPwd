<script lang="ts">
	import { onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';

	interface Props {
		entryId: string;
		field: string;
		label: string;
		multiline?: boolean;
	}

	const EXPOSURE_MS = 30_000;

	let { entryId, field, label, multiline = false }: Props = $props();

	let revealed = $state<string>();
	let status = $state<{ kind: 'ok' | 'error'; text: string }>();
	let busy = $state(false);
	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	let clipboardTimer: ReturnType<typeof setTimeout> | undefined;

	async function requestSecret(purpose: 'view' | 'copy'): Promise<string | undefined> {
		busy = true;
		status = undefined;
		try {
			const response = await fetch(`/api/entries/${entryId}/reveals`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ field, purpose })
			});
			const body = (await response.json()) as { value?: string; code?: string; message?: string };
			if (body.code === 'reauth_required') {
				window.location.assign(`/auth/google?next=${encodeURIComponent(window.location.pathname)}`);
				return undefined;
			}
			if (!response.ok || body.value === undefined) {
				status = { kind: 'error', text: body.message ?? 'Could not open this secret.' };
				return undefined;
			}
			void invalidateAll();
			return body.value;
		} catch {
			status = { kind: 'error', text: 'Network error. Nothing was copied.' };
			return undefined;
		} finally {
			busy = false;
		}
	}

	function hide() {
		clearTimeout(hideTimer);
		revealed = undefined;
	}

	async function toggleReveal() {
		if (revealed !== undefined) return hide();
		revealed = await requestSecret('view');
		if (revealed !== undefined) hideTimer = setTimeout(hide, EXPOSURE_MS);
	}

	/**
	 * Safari only allows a clipboard write started inside the click itself, so the pending
	 * request is handed to the clipboard as a promise instead of being awaited first.
	 */
	async function writeToClipboard(pending: Promise<string | undefined>): Promise<boolean> {
		if (typeof ClipboardItem === 'undefined') {
			const value = await pending;
			if (value === undefined) return false;
			await navigator.clipboard.writeText(value);
			return true;
		}
		const asBlob = pending.then((value) => {
			if (value === undefined) throw new Error('secret unavailable');
			return new Blob([value], { type: 'text/plain' });
		});
		await navigator.clipboard.write([new ClipboardItem({ 'text/plain': asBlob })]);
		return true;
	}

	async function copy() {
		try {
			if (!(await writeToClipboard(requestSecret('copy')))) return;
		} catch {
			status ??= { kind: 'error', text: 'The browser refused clipboard access.' };
			return;
		}
		status = { kind: 'ok', text: 'Copied. Clipboard is cleared in 30 seconds.' };
		clearTimeout(clipboardTimer);
		clipboardTimer = setTimeout(() => {
			void navigator.clipboard.writeText('').catch(() => undefined);
			status = undefined;
		}, EXPOSURE_MS);
	}

	onDestroy(() => {
		clearTimeout(hideTimer);
		clearTimeout(clipboardTimer);
	});
</script>

<div class="secret">
	<div class="label muted">{label}</div>
	<div class="value mono" class:multiline>
		{#if revealed === undefined}
			<span aria-label="Hidden value">••••••••••••</span>
		{:else}
			{revealed}
		{/if}
	</div>
	<div class="row">
		<button
			type="button"
			class="btn btn-small btn-secondary"
			disabled={busy}
			onclick={toggleReveal}
		>
			{revealed === undefined ? 'Reveal' : 'Hide'}
		</button>
		<button type="button" class="btn btn-small btn-primary" disabled={busy} onclick={copy}>
			Copy
		</button>
	</div>
	{#if status}
		<p class="status" class:error={status.kind === 'error'} role="status">{status.text}</p>
	{/if}
</div>

<style>
	.secret {
		display: grid;
		grid-template-columns: 160px minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px 16px;
		padding: 12px 0;
		border-bottom: 1px solid var(--border);
	}

	.value.multiline {
		white-space: pre-wrap;
	}

	.status {
		grid-column: 2 / -1;
		color: var(--green);
	}

	.status.error {
		color: var(--red);
	}

	@media (max-width: 639px) {
		.secret {
			grid-template-columns: minmax(0, 1fr);
		}

		.status {
			grid-column: 1;
		}
	}
</style>
