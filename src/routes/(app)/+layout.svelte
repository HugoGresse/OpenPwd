<script lang="ts">
	import { resolve } from '$app/paths';
	import { clearClipboardNow } from '#lib/clipboard.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<svelte:window onpagehide={clearClipboardNow} />

<header class="topbar">
	<div class="inner spread">
		<a class="brand" href={resolve('/(app)')}>OpenPwd</a>
		<form method="POST" action="/auth/logout" class="row" onsubmit={clearClipboardNow}>
			<span class="muted">{data.user.email}</span>
			<button class="btn btn-small">Sign out</button>
		</form>
	</div>
</header>

<main class="container stack">
	{@render children()}
</main>

<style>
	.topbar {
		position: sticky;
		top: 0;
		z-index: 100;
		border-bottom: 1px solid var(--border);
		background: rgba(255, 255, 255, 0.95);
	}

	.inner {
		max-width: 960px;
		min-height: 64px;
		margin: 0 auto;
		padding: 8px 32px;
	}

	.brand {
		color: var(--navy);
		font-size: 18px;
		font-weight: 500;
	}

	.brand:hover {
		color: var(--purple);
		text-decoration: none;
	}

	@media (max-width: 639px) {
		.inner {
			padding: 8px 12px;
		}
	}
</style>
