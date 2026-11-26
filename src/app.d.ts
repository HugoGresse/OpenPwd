import type { AppSupabaseClient } from '#lib/server/supabase.ts';

declare global {
	namespace App {
		interface Locals {
			supabase: AppSupabaseClient;
			user: { id: string; email: string } | null;
			googleAccessToken: string | undefined;
		}
	}
}

export {};
