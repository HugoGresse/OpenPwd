<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h1>Organizations</h1>

{#if data.organizations.length === 0}
	<p class="card muted">
		You are not a member of any organization yet. Create one, or ask an owner to add you.
	</p>
{:else}
	<ul class="orgs">
		{#each data.organizations as organization (organization.id)}
			<li>
				<a
					class="card org spread"
					href={resolve('/(app)/orgs/[orgId]', { orgId: organization.id })}
				>
					<h2>{organization.name}</h2>
					<span class="badge">{organization.role}</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<section class="card stack">
	<h2>New organization</h2>
	{#if form?.message}
		<p class="alert" role="alert">{form.message}</p>
	{/if}
	<form method="POST" action="?/create" class="row" use:enhance>
		<label class="grow">
			Name
			<input name="name" required maxlength="80" placeholder="Treasury, Communication…" />
		</label>
		<button class="btn btn-primary end">Create</button>
	</form>
</section>

<style>
	.orgs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 16px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.org {
		color: var(--navy);
	}

	.org:hover {
		border-color: var(--purple);
		text-decoration: none;
	}

	.grow {
		flex: 1 1 240px;
	}

	.end {
		align-self: flex-end;
	}
</style>
