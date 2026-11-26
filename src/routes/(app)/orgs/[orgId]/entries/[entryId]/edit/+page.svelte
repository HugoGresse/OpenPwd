<script lang="ts">
	import { resolve } from '$app/paths';
	import EntryForm from '#lib/components/EntryForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>Edit {data.entry.title}</h2>
<EntryForm
	mode="edit"
	cancelHref={resolve('/(app)/orgs/[orgId]/entries/[entryId]', {
		orgId: data.organization.id,
		entryId: data.entry.id
	})}
	error={form?.message}
	existing={data.entry}
/>
