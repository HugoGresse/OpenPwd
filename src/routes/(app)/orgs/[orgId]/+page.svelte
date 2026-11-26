<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDate } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let search = $state('');
	const visibleEntries = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		if (!needle) return data.entries;
		return data.entries.filter((entry) =>
			[entry.title, entry.url, entry.username].some((value) =>
				value?.toLowerCase().includes(needle)
			)
		);
	});
</script>

<div class="spread">
	<label class="search">
		<span class="sr-only">Search passwords</span>
		<input type="search" placeholder="Search by title, site or username" bind:value={search} />
	</label>
	<div class="row">
		<a
			class="btn btn-secondary"
			href={resolve('/(app)/orgs/[orgId]/import', { orgId: data.organization.id })}
		>
			Import
		</a>
		<a
			class="btn btn-primary"
			href={resolve('/(app)/orgs/[orgId]/entries/new', { orgId: data.organization.id })}
		>
			New password
		</a>
	</div>
</div>

{#if data.entries.length === 0}
	<p class="card muted">No password stored yet.</p>
{:else if visibleEntries.length === 0}
	<p class="card muted">Nothing matches “{search}”.</p>
{:else}
	<div class="card table-wrap">
		<table>
			<thead>
				<tr>
					<th>Title</th>
					<th>Username</th>
					<th>Last edited</th>
					<th>Last opened</th>
				</tr>
			</thead>
			<tbody>
				{#each visibleEntries as entry (entry.id)}
					<tr>
						<td>
							<a
								href={resolve('/(app)/orgs/[orgId]/entries/[entryId]', {
									orgId: data.organization.id,
									entryId: entry.id
								})}
							>
								{entry.title}
							</a>
						</td>
						<td class="muted">{entry.username ?? '—'}</td>
						<td class="muted">{formatDate(entry.updated_at)}</td>
						<td class="muted">{formatDate(entry.last_accessed_at)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.search {
		flex: 1 1 280px;
		max-width: 420px;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
