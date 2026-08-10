import type { SupabaseClient } from '@supabase/supabase-js';

export const SOURCE_UPLOADS_BUCKET = 'source-uploads';

// Thrown on any Storage-layer failure (network, bucket misconfiguration) --
// distinct from the file-content validation errors in `lib/files`, since this
// means the file itself was fine and something else went wrong persisting it.
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

// Only this module talks to Supabase Storage (same "one module per external
// system" rule as lib/ai and lib/sources -- see docs/tdd.md). Access is via
// the service-role client, same pattern as lib/supabase/client.ts's other
// consumers -- authorization is enforced by the caller (loadOwnedProject),
// not by Storage-level RLS (bucket RLS policies are still scaffolding-only,
// see supabase/migrations/20260806060000_source_uploads_bucket.sql).
export async function uploadSourceFile(
  supabase: SupabaseClient,
  params: { path: string; data: Uint8Array; contentType: string },
): Promise<void> {
  const { error } = await supabase.storage.from(SOURCE_UPLOADS_BUCKET).upload(params.path, params.data, {
    contentType: params.contentType,
    upsert: false,
  });
  if (error) throw new StorageError(error.message);
}
