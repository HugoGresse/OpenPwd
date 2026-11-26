<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import { generatePassword } from '#lib/format.ts';

	interface FieldValue {
		label: string;
		value: string;
	}

	interface Props {
		mode: 'create' | 'edit';
		cancelHref: ResolvedPathname;
		error?: string;
		initial?: {
			title: string;
			url: string;
			username: string;
			note: string;
			fields: FieldValue[];
		};
	}

	let { mode, cancelHref, error, initial }: Props = $props();

	let password = $state('');
	let passwordVisible = $state(false);
	// svelte-ignore state_referenced_locally
	let fields = $state<FieldValue[]>(initial?.fields.map((field) => ({ ...field })) ?? []);
	let saving = $state(false);

	const addField = () => fields.push({ label: '', value: '' });
	const removeField = (index: number) => fields.splice(index, 1);
	function suggestPassword() {
		password = generatePassword();
		passwordVisible = true;
	}
</script>

<form
	method="POST"
	class="card stack"
	autocomplete="off"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
>
	{#if error}
		<p class="alert" role="alert">{error}</p>
	{/if}

	<label>
		Title
		<input name="title" required maxlength="120" value={initial?.title ?? ''} />
	</label>
	<label>
		Website
		<input
			name="url"
			type="url"
			maxlength="2048"
			placeholder="https://"
			value={initial?.url ?? ''}
		/>
	</label>
	<label>
		Username
		<input name="username" maxlength="320" autocomplete="off" value={initial?.username ?? ''} />
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

	<fieldset class="stack tight">
		<legend>Other secret fields</legend>
		{#each fields as field, index (index)}
			<div class="field-row">
				<input
					name="fieldLabel"
					aria-label="Field name"
					placeholder="Name, e.g. PIN"
					maxlength="60"
					bind:value={field.label}
				/>
				<input
					name="fieldValue"
					aria-label="Field value"
					placeholder="Value"
					maxlength="4000"
					autocomplete="off"
					bind:value={field.value}
				/>
				<button type="button" class="btn btn-small btn-danger" onclick={() => removeField(index)}>
					Remove
				</button>
			</div>
		{/each}
		<div>
			<button
				type="button"
				class="btn btn-small btn-secondary"
				disabled={fields.length >= 30}
				onclick={addField}
			>
				Add field
			</button>
		</div>
	</fieldset>

	<label>
		Note
		<textarea name="note" maxlength="10000">{initial?.note ?? ''}</textarea>
	</label>

	<div class="row">
		<button class="btn btn-primary" disabled={saving}>
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
		gap: 8px;
	}

	@media (max-width: 639px) {
		.field-row {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
