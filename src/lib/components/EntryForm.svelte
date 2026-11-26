<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import { generatePassword } from '#lib/format.ts';

	interface FieldValue {
		label: string;
		value: string;
	}

	interface Secrets {
		note: string;
		fields: FieldValue[];
	}

	interface Props {
		mode: 'create' | 'edit';
		cancelHref: ResolvedPathname;
		error?: string;
		/** Edit mode only. The note and fields are not part of it: they are unlocked on demand. */
		existing?: {
			id: string;
			title: string;
			url: string;
			username: string;
			version: number;
			hasSecrets: boolean;
		};
	}

	let { mode, cancelHref, error, existing }: Props = $props();

	// Bound state, not plain `value` attributes: Svelte rewrites those after hydration and when a
	// submit fails, which erased what was typed.
	// svelte-ignore state_referenced_locally
	let title = $state(existing?.title ?? '');
	// svelte-ignore state_referenced_locally
	let url = $state(existing?.url ?? '');
	// svelte-ignore state_referenced_locally
	let username = $state(existing?.username ?? '');
	let password = $state('');
	let passwordVisible = $state(false);
	// svelte-ignore state_referenced_locally
	let secrets = $state<Secrets | undefined>(
		existing?.hasSecrets ? undefined : { note: '', fields: [] }
	);
	let unlockError = $state<string>();
	let busy = $state(false);

	function suggestPassword() {
		password = generatePassword();
		passwordVisible = true;
	}

	/** An explicit, audited request: opening or preloading the page never decrypts anything. */
	async function unlockSecrets() {
		if (!existing) return;
		busy = true;
		unlockError = undefined;
		try {
			const response = await fetch(`/api/entries/${existing.id}/reveals`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ purpose: 'edit' })
			});
			const body = (await response.json()) as Partial<Secrets> & {
				version?: number;
				code?: string;
				message?: string;
			};
			if (body.code === 'reauth_required') {
				window.location.assign(`/auth/google?next=${encodeURIComponent(window.location.pathname)}`);
			} else if (!response.ok || !body.fields || body.note === undefined) {
				unlockError = body.message ?? 'Could not open the note and fields.';
			} else if (body.version !== existing.version) {
				unlockError = 'Someone else changed this entry. Reload the page before editing.';
			} else {
				secrets = { note: body.note, fields: body.fields };
			}
		} catch {
			unlockError = 'Network error. Nothing was opened.';
		} finally {
			busy = false;
		}
	}
</script>

<form
	method="POST"
	class="card stack"
	autocomplete="off"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	{#if error}
		<p class="alert" role="alert">{error}</p>
	{/if}

	{#if existing}
		<input type="hidden" name="version" value={existing.version} />
	{/if}

	<label>
		Title
		<input name="title" required maxlength="120" bind:value={title} />
	</label>
	<label>
		Website
		<input name="url" type="url" maxlength="2048" placeholder="https://" bind:value={url} />
	</label>
	<label>
		Username
		<input name="username" maxlength="320" autocomplete="off" bind:value={username} />
	</label>

	<div class="stack tight">
		<label>
			Password
			<input
				name="password"
				type={passwordVisible ? 'text' : 'password'}
				maxlength="1000"
				autocomplete="new-password"
				required={mode === 'create'}
				placeholder={mode === 'edit' ? 'Leave empty to keep the current password' : ''}
				bind:value={password}
			/>
		</label>
		<div class="row">
			<button
				type="button"
				class="btn btn-small btn-secondary"
				onclick={() => (passwordVisible = !passwordVisible)}
			>
				{passwordVisible ? 'Hide' : 'Show'}
			</button>
			<button type="button" class="btn btn-small btn-secondary" onclick={suggestPassword}>
				Generate
			</button>
		</div>
	</div>

	{#if secrets}
		{@const unlocked = secrets}
		<input type="hidden" name="secretsUnlocked" value="true" />
		<fieldset class="stack tight">
			<legend>Other secret fields</legend>
			{#each unlocked.fields as field, index (index)}
				<div class="field-row">
					<input
						name="fieldLabel"
						aria-label="Field name"
						placeholder="Name, e.g. PIN"
						required
						maxlength="60"
						bind:value={field.label}
					/>
					<!-- A textarea: a single-line input drops the line breaks of a key or a list of codes. -->
					<textarea
						name="fieldValue"
						aria-label="Field value"
						placeholder="Value"
						rows="1"
						maxlength="4000"
						autocomplete="off"
						spellcheck="false"
						bind:value={field.value}></textarea>
					<button
						type="button"
						class="btn btn-small btn-danger"
						onclick={() => unlocked.fields.splice(index, 1)}
					>
						Remove
					</button>
				</div>
			{/each}
			<div>
				<button
					type="button"
					class="btn btn-small btn-secondary"
					disabled={unlocked.fields.length >= 30}
					onclick={() => unlocked.fields.push({ label: '', value: '' })}
				>
					Add field
				</button>
			</div>
		</fieldset>

		<label>
			Note
			<textarea name="note" maxlength="10000" bind:value={unlocked.note}></textarea>
		</label>
	{:else}
		<div class="locked stack tight">
			<p class="muted">
				The note and the other secret fields stay as they are. Unlock them to change them; this is
				recorded in the audit log.
			</p>
			{#if unlockError}
				<p class="alert" role="alert">{unlockError}</p>
			{/if}
			<div>
				<button
					type="button"
					class="btn btn-small btn-secondary"
					disabled={busy}
					onclick={unlockSecrets}
				>
					Unlock note and fields
				</button>
			</div>
		</div>
	{/if}

	<div class="row">
		<button class="btn btn-primary" disabled={busy}>
			{mode === 'create' ? 'Save password' : 'Save changes'}
		</button>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved by the caller -->
		<a class="btn" href={cancelHref}>Cancel</a>
	</div>
</form>

<style>
	.tight {
		gap: 8px;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: none;
	}

	legend {
		margin-bottom: 8px;
		padding: 0;
		color: var(--slate);
	}

	.field-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
		align-items: start;
		gap: 8px;
	}

	.field-row textarea {
		min-height: 40px;
		resize: vertical;
	}

	.locked {
		padding: 16px;
		border: 1px dashed var(--border-hover);
		border-radius: 4px;
	}

	@media (max-width: 639px) {
		.field-row {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
