<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { MAX_IMPORT_ROWS, parseImport } from '#lib/import.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let table = $state('');
	let importing = $state(false);

	const preview = $derived(parseImport(table));
	const problemCount = $derived(preview.rows.filter((row) => row.problem).length);
	const ready = $derived(preview.rows.length > 0 && problemCount === 0 && !preview.problem);
	const message = $derived(form && 'message' in form ? form.message : undefined);
	const imported = $derived(form && 'imported' in form ? form.imported : undefined);
</script>

<h2>Import passwords</h2>

{#if imported !== undefined}
	<div class="notice stack" role="status">
		<p>{imported} passwords imported and encrypted.</p>
		<p>
			Now delete the document they came from, including its version history, and change the
			passwords that were stored in it: anyone who had the document still knows them.
		</p>
		<p>
			<a href={resolve('/(app)/orgs/[orgId]', { orgId: data.organization.id })}>
				See the imported passwords
			</a>
		</p>
	</div>
{/if}
{#if message}
	<p class="alert" role="alert">{message}</p>
{/if}

<form
	method="POST"
	class="card stack"
	autocomplete="off"
	use:enhance={() => {
		importing = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			importing = false;
			if (result.type === 'success') table = '';
		};
	}}
>
	<p class="muted">
		Copy the table from your document or spreadsheet and paste it below, one password per row.
		Columns in order: title, website, username, password, note. With a header row (Title, URL,
		Username, Password, Note) the order is free and any other column becomes a secret field. Up to {MAX_IMPORT_ROWS}
		rows at a time.
	</p>
	<label>
		Pasted table
		<textarea name="table" rows="8" spellcheck="false" bind:value={table}></textarea>
	</label>

	{#if preview.problem}
		<p class="alert" role="alert">{preview.problem}</p>
	{/if}

	{#if preview.rows.length > 0}
		<p class="muted">
			{preview.rows.length}
			{preview.rows.length === 1 ? 'row' : 'rows'} found. Check that this matches your table.
		</p>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Line</th>
						<th>Title</th>
						<th>Website</th>
						<th>Username</th>
						<th>Password</th>
						<th>Extras</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{#each preview.rows as row (row.line)}
						<tr>
							<td class="muted">{row.line}</td>
							<td>{row.title || '—'}</td>
							<td class="muted">{row.url || '—'}</td>
							<td class="muted">{row.username || '—'}</td>
							<td class="mono">{row.password ? '••••••' : '—'}</td>
							<td class="muted">
								{[...row.fields.map((field) => field.label), ...(row.note ? ['note'] : [])].join(
									', '
								) || '—'}
							</td>
							<td>
								{#if row.problem}
									<span class="problem">{row.problem}</span>
								{:else}
									<span class="badge">ready</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<div class="row">
		<button class="btn btn-primary" disabled={!ready || importing}>
			{importing ? 'Importing…' : 'Import'}
		</button>
		{#if problemCount > 0}
			<span class="problem">
				Fix {problemCount}
				{problemCount === 1 ? 'row' : 'rows'} before importing.
			</span>
		{/if}
	</div>
</form>

<style>
	textarea {
		font-family: var(--mono);
		white-space: pre;
	}

	.problem {
		color: var(--red);
	}
</style>
