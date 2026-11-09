// supabase/functions/extract-provider-profile/index.ts
// The Info Reg "Import" box: reads a business's details, services, add-ons
// and policies from a link, or from photos/screenshots/PDFs uploaded from the
// app, and hands them back for the person to check before anything is saved.
// The reading itself (prompt, model, output shape) lives in
// _shared/extractProviderProfile.ts, shared with the batch run-scrape-job
// pipeline, which calls it in-process rather than through this endpoint.
//
// Each read is a paid Claude call, so only provider accounts (including an
// admin signed in as a provider they're setting up) and admins may call it.
// That also keeps this from being an open fetch proxy for anyone with the
// anon key.
import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import {
  extractProviderProfile,
  extractProviderProfileFromFiles,
  ExtractionError,
  UPLOAD_MEDIA_TYPES,
  type ExtractedProviderProfile,
  type UploadedFile,
} from '../_shared/extractProviderProfile.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** The app slices long screenshots, so a few photos can become this many. */
const MAX_FILES = 20;
/** Total base64 across every upload, about 18 MB of real file. */
const MAX_TOTAL_BASE64_CHARS = 24 * 1024 * 1024;

function parseFiles(raw: unknown): UploadedFile[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return 'Add at least one photo or PDF.';
  if (raw.length > MAX_FILES) return `That's more than ${MAX_FILES} pages. Try the pages with prices first.`;
  const files: UploadedFile[] = [];
  let total = 0;
  for (const item of raw) {
    const file = item as { mediaType?: unknown; data?: unknown } | null;
    const mediaType = file?.mediaType;
    const data = file?.data;
    if (typeof mediaType !== 'string' || !(UPLOAD_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
      return 'Only photos (JPEG, PNG, WebP) and PDFs can be read.';
    }
    if (typeof data !== 'string' || data.length === 0) return 'One of the files was empty.';
    total += data.length;
    if (total > MAX_TOTAL_BASE64_CHARS) return 'Those files are too big together. Try fewer pages at a time.';
    files.push({ mediaType: mediaType as UploadedFile['mediaType'], data });
  }
  return files;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Must be signed in to use this.' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: callerData, error: callerError } = await admin.auth.getUser(jwt);
    const caller = callerData?.user;
    if (callerError || !caller) return json({ error: 'Must be signed in to use this.' }, 401);

    const [{ data: userRow, error: userError }, { data: adminRow, error: adminError }] = await Promise.all([
      admin.from('users').select('role').eq('id', caller.id).maybeSingle(),
      admin.from('admin_users').select('user_id').eq('user_id', caller.id).maybeSingle(),
    ]);
    if (userError || adminError) {
      console.error('[extract-provider-profile] role check failed:', userError ?? adminError);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
    if (userRow?.role !== 'provider' && !adminRow) {
      return json({ error: 'Only business accounts can import a price list.' }, 403);
    }

    const body = (await req.json().catch(() => null)) as { url?: unknown; files?: unknown } | null;
    let extracted: ExtractedProviderProfile;
    if (typeof body?.url === 'string' && body.url.trim()) {
      extracted = await extractProviderProfile(body.url.trim());
    } else if (body?.files !== undefined) {
      const files = parseFiles(body.files);
      if (typeof files === 'string') return json({ error: files }, 400);
      extracted = await extractProviderProfileFromFiles(files);
    } else {
      return json({ error: 'Add a link, photos or a PDF.' }, 400);
    }

    console.log(`[extract-provider-profile] ${caller.id} read ${Object.values(extracted.categories ?? {}).flat().length} services`);
    return json({ extracted });
  } catch (error) {
    if (error instanceof ExtractionError) return json({ error: error.message }, error.status);
    console.error('[extract-provider-profile] unexpected error:', error);
    return json({ error: 'Something went wrong reading that. Please try again.' }, 500);
  }
});
