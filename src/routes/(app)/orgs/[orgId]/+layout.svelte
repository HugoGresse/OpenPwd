<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const sections = [
		{ route: '/(app)/orgs/[orgId]', label: 'Passwords', managersOnly: false },
		{ route: '/(app)/orgs/[orgId]/members', label: 'Members', managersOnly: false },
		{ route: '/(app)/orgs/[orgId]/audit', label: 'Audit log', managersOnly: true }
	] as const;

	const visibleSections = $derived(
		sections.filter((section) => data.canManage || !section.managersOnly)
	);
	const passwordRoutes = [`${sections[0].route}/entries`, `${sections[0].route}/import`];
	const isCurrent = (route: string) =>
		page.route.id === route ||
		(route === sections[0].route &&
			passwordRoutes.some((prefix) => page.route.id?.startsWith(prefix) === true));
</script>

<div class="spread">
	<div>
		<a href={resolve('/(app)')}>Organizations</a>
		<h1>{data.organization.name}</h1>
	</div>
	<span class="badge">{data.role}</span>
</div>

<nav class="tabs" aria-label="Organization sections">
	{#each visibleSections as section (section.route)}
		<a
			class="tab"
			href={resolve(section.route, { orgId: data.organization.id })}
			aria-current={isCurrent(section.route) ? 'page' : undefined}
		>
			{section.label}
		</a>
	{/each}
</nav>

{@render children()}
