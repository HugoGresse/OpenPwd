<script lang="ts">
	import { resolve } from '$app/paths';
	import EntryForm from '#lib/components/EntryForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>New password</h2>
<EntryForm
	mode="create"
	cancelHref={resolve('/(app)/orgs/[orgId]', { orgId: data.organization.id })}
	error={form?.message}
/>
