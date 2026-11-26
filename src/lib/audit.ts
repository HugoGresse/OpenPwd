export interface AuditEvent {
	action: string;
	entry_title: string | null;
	detail: unknown;
}

const detailOf = (event: AuditEvent): Record<string, unknown> =>
	typeof event.detail === 'object' && event.detail !== null && !Array.isArray(event.detail)
		? (event.detail as Record<string, unknown>)
		: {};

const text = (value: unknown): string =>
	typeof value === 'string' || typeof value === 'number' ? String(value) : '?';

const entryName = (event: AuditEvent) => `“${event.entry_title ?? 'deleted entry'}”`;

const DESCRIPTIONS: Record<string, (event: AuditEvent, detail: Record<string, unknown>) => string> =
	{
		'org.create': (_, detail) => `Created the organization ${text(detail.name)}`,
		'member.add': (_, detail) => `Added ${text(detail.email)} as ${text(detail.role)}`,
		'member.role': (_, detail) => `Changed a role from ${text(detail.from)} to ${text(detail.to)}`,
		'member.remove': (_, detail) => `Removed ${text(detail.email)}`,
		'invite.add': (_, detail) => `Invited ${text(detail.email)} as ${text(detail.role)}`,
		'invite.claim': (_, detail) => `Joined through an invite as ${text(detail.role)}`,
		'invite.remove': (_, detail) => `Cancelled the invite of ${text(detail.email)}`,
		'entry.create': (event) => `Created ${entryName(event)}`,
		'entry.update': (event) => `Edited ${entryName(event)}`,
		'entry.delete': (event) => `Deleted ${entryName(event)}`,
		'secret.view': (event, detail) => `Revealed ${text(detail.field)} of ${entryName(event)}`,
		'secret.copy': (event, detail) => `Copied ${text(detail.field)} of ${entryName(event)}`,
		'secret.edit': (event) => `Opened ${entryName(event)} for editing`
	};

export const describeEvent = (event: AuditEvent): string =>
	DESCRIPTIONS[event.action]?.(event, detailOf(event)) ?? event.action;
