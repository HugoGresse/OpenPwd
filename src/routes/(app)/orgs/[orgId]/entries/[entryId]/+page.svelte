<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import SecretRow from '#lib/components/SecretRow.svelte';
	import { formatDate, safeExternalUrl } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const entry = $derived(data.entry);
	const link = $derived(safeExternalUrl(entry.url));
	let confirmingDelete = $state(false);
</script>

<div class="spread">
	<h2>{entry.title}</h2>
	<div class="row">
		<a
			class="btn btn-small btn-secondary"
			href={resolve('/(app)/orgs/[orgId]/entries/[entryId]/edit', {
				orgId: data.organization.id,
				entryId: entry.id
			})}
		>
			Edit
		</a>
		<button
			type="button"
			class="btn btn-small btn-danger"
			onclick={() => (confirmingDelete = true)}
		>
			Delete
		</button>
	</div>
</div>

{#if form?.message}
	<p class="alert" role="alert">{form.message}</p>
{/if}

{#if confirmingDelete}
	<form method="POST" action="?/delete" class="alert spread" use:enhance>
		<span>Delete “{entry.title}” for everyone? This cannot be undone.</span>
		<span class="row">
			<button class="btn btn-small btn-danger">Delete permanently</button>
			<button type="button" class="btn btn-small" onclick={() => (confirmingDelete = false)}>
				Keep
			</button>
		</span>
	</form>
{/if}

<section class="card">
	<dl class="plain">
		<dt class="muted">Website</dt>
		<dd>
			{#if link}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external site -->
				<a href={link} target="_blank" rel="noopener noreferrer">{entry.url}</a>
			{:else}
				{entry.url ?? '—'}
			{/if}
		</dd>
		<dt class="muted">Username</dt>
		<dd class="mono">{entry.username ?? '—'}</dd>
	</dl>

	<SecretRow entryId={entry.id} field="password" label="Password" />
	{#each entry.field_labels as label, index (index)}
		<SecretRow entryId={entry.id} field="field:{index}" {label} multiline />
	{/each}
	{#if entry.has_note}
		<SecretRow entryId={entry.id} field="note" label="Note" multiline />
	{/if}
</section>

<section class="card">
	<dl class="plain">
		<dt class="muted">Last edited</dt>
		<dd>{formatDate(entry.updated_at)} by {entry.editor?.email ?? 'a removed account'}</dd>
		<dt class="muted">Last opened</dt>
		<dd>
			{#if entry.last_accessed_at}
				{formatDate(entry.last_accessed_at)} by {entry.reader?.email ?? 'a removed account'}
			{:else}
				Never
			{/if}
		</dd>
		<dt class="muted">Created</dt>
		<dd>{formatDate(entry.created_at)}</dd>
	</dl>
</section>

<style>
	.plain {
		display: grid;
		grid-template-columns: 160px minmax(0, 1fr);
		gap: 12px 16px;
		margin: 0;
	}

	.plain dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	section .plain:first-child:not(:last-child) {
		padding-bottom: 12px;
		border-bottom: 1px solid var(--border);
	}

	@media (max-width: 639px) {
		.plain {
			grid-template-columns: minmax(0, 1fr);
			gap: 4px;
		}
	}
</style>
