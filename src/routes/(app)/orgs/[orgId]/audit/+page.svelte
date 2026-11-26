<script lang="ts">
	import { resolve } from '$app/paths';
	import { describeEvent } from '#lib/audit.ts';
	import { formatDate } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const filters = [
		{ group: '', label: 'Everything' },
		{ group: 'secrets', label: 'Passwords opened' },
		{ group: 'entries', label: 'Changes' },
		{ group: 'members', label: 'Members' }
	];
	const orgId = $derived(data.organization.id);
</script>

<nav class="row" aria-label="Audit filters">
	{#each filters as filter (filter.group)}
		<a
			class="btn btn-small"
			class:btn-secondary={filter.group === data.group}
			href={resolve(`/(app)/orgs/[orgId]/audit?group=${filter.group}`, { orgId })}
		>
			{filter.label}
		</a>
	{/each}
</nav>

{#if data.events.length === 0}
	<p class="card muted">Nothing recorded for this filter.</p>
{:else}
	<div class="card table-wrap">
		<table>
			<thead>
				<tr>
					<th>When</th>
					<th>Who</th>
					<th>What</th>
					<th>From</th>
				</tr>
			</thead>
			<tbody>
				{#each data.events as event (event.id)}
					<tr>
						<td class="muted nowrap">{formatDate(event.created_at)}</td>
						<td>{event.actor_email}</td>
						<td>{describeEvent(event)}</td>
						<td class="muted mono">{event.client_ip ?? '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<nav class="spread" aria-label="Audit pages">
	{#if data.page > 1}
		<a
			class="btn btn-small btn-secondary"
			href={resolve(`/(app)/orgs/[orgId]/audit?group=${data.group}&page=${data.page - 1}`, {
				orgId
			})}
		>
			Newer
		</a>
	{:else}
		<span></span>
	{/if}
	<span class="muted">Page {data.page} of {data.pageCount}</span>
	{#if data.page < data.pageCount}
		<a
			class="btn btn-small btn-secondary"
			href={resolve(`/(app)/orgs/[orgId]/audit?group=${data.group}&page=${data.page + 1}`, {
				orgId
			})}
		>
			Older
		</a>
	{:else}
		<span></span>
	{/if}
</nav>

<style>
	.nowrap {
		white-space: nowrap;
	}
</style>
