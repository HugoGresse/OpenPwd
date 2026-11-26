<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const roles = ['member', 'admin', 'owner'] as const;
	const assignableRoles = $derived(data.role === 'owner' ? roles : roles.slice(0, 2));
	const message = $derived(form && 'message' in form ? form.message : undefined);
	const notice = $derived(form && 'notice' in form ? form.notice : undefined);
</script>

{#if message}
	<p class="alert" role="alert">{message}</p>
{/if}
{#if notice}
	<p class="notice" role="status">{notice}</p>
{/if}

<p class="muted">
	Membership here controls who sees the list. Opening a password also requires being in the Google
	group that holds the encryption key.
</p>

<div class="card table-wrap">
	<table>
		<thead>
			<tr>
				<th>Member</th>
				<th>Role</th>
				{#if data.canManage}<th>Actions</th>{/if}
			</tr>
		</thead>
		<tbody>
			{#each data.members as member (member.user_id)}
				{@const editable = data.canManage && (data.role === 'owner' || member.role !== 'owner')}
				<tr>
					<td>{member.profile?.email ?? 'unknown'}</td>
					<td>
						{#if editable}
							<form method="POST" action="?/role" class="row" use:enhance>
								<input type="hidden" name="userId" value={member.user_id} />
								<select name="role" aria-label="Role of {member.profile?.email}">
									{#each assignableRoles as role (role)}
										<option value={role} selected={role === member.role}>{role}</option>
									{/each}
								</select>
								<button class="btn btn-small btn-secondary">Save</button>
							</form>
						{:else}
							<span class="badge">{member.role}</span>
						{/if}
					</td>
					{#if data.canManage}
						<td>
							{#if editable}
								<form method="POST" action="?/remove" use:enhance>
									<input type="hidden" name="userId" value={member.user_id} />
									<button class="btn btn-small btn-danger">Remove</button>
								</form>
							{/if}
						</td>
					{/if}
				</tr>
			{/each}
			{#each data.invites as invite (invite.email)}
				<tr>
					<td>{invite.email} <span class="badge badge-neutral">not signed in yet</span></td>
					<td><span class="badge">{invite.role}</span></td>
					<td>
						<form method="POST" action="?/removeInvite" use:enhance>
							<input type="hidden" name="email" value={invite.email} />
							<button class="btn btn-small btn-danger">Remove</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#if data.canManage}
	<section class="card stack">
		<h2>Add a member</h2>
		<form method="POST" action="?/add" class="add" use:enhance>
			<label>
				Email
				<input name="email" type="email" required maxlength="320" autocomplete="off" />
			</label>
			<label>
				Role
				<select name="role">
					{#each assignableRoles as role (role)}
						<option value={role}>{role}</option>
					{/each}
				</select>
			</label>
			<button class="btn btn-primary">Add</button>
		</form>
	</section>
{/if}

<style>
	select {
		width: auto;
		min-width: 120px;
	}

	.add {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto;
		align-items: end;
		gap: 16px;
	}

	.add select {
		width: 100%;
	}

	@media (max-width: 639px) {
		.add {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
