<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<main class="login">
	<section class="card panel stack">
		<div>
			<h1>OpenPwd</h1>
			<p class="muted">Shared passwords for {data.domain}</p>
		</div>

		{#if data.error}
			<p class="alert" role="alert">{data.error}</p>
		{/if}

		{#if data.localMode}
			<form method="POST" action="/auth/dev" class="stack">
				<p class="badge badge-neutral">Local development mode: no Google, no real encryption key</p>
				<label>
					Dev account name
					<input name="name" value="alice" required pattern="[a-z0-9.\-]+" autocomplete="off" />
				</label>
				<button class="btn btn-primary">Sign in as dev account</button>
			</form>
		{:else}
			<a
				class="btn btn-primary"
				href={resolve(`/auth/google?next=${encodeURIComponent(data.next)}`)}
				data-sveltekit-reload
			>
				Sign in with Google
			</a>
			<p class="muted">Every password you open or copy is recorded in the audit log.</p>
		{/if}
	</section>
</main>

<style>
	.login {
		display: grid;
		min-height: 100vh;
		place-items: center;
		padding: 16px;
	}

	.panel {
		width: 100%;
		max-width: 400px;
		padding: 32px;
		box-shadow: var(--shadow-lg);
	}
</style>
