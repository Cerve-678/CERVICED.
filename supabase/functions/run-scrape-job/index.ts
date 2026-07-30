// supabase/functions/run-scrape-job/index.ts
// Processes a batch of pending sources on a provider_scrape_jobs row:
// extracts each URL via the shared extractProviderProfile(), dedupes
// against providers already on the platform, and inserts new unclaimed
// (is_claimed = false, source = 'scraped') provider + services rows.
//
// One invocation handles up to BATCH_SIZE sources (Edge Functions have a
// wall-clock limit, and each extraction does a page fetch + Claude call).
// If a job has more pending sources than that, it's left in 'running' and
// a subsequent invocation (see provider_scrape_pipeline_cron.sql) picks up
// where this one left off — no per-invocation coordination needed since
// each source is claimed via its own status update before being processed.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractProviderProfile, type ExtractedProviderProfile } from '../_shared/extractProviderProfile.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 10;
const DELAY_BETWEEN_SOURCES_MS = 1200; // politeness delay between fetches
const VALID_CATEGORIES = ['HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'MALE', 'KIDS', 'OTHER'];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateSlug(name: string, suffix: string): string {
  const base = (name || 'provider')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50) || 'provider';
  return `${base}-${suffix}`;
}

function parseDurationToMinutes(duration?: string): number {
  if (!duration) return 60;
  const lower = duration.toLowerCase().trim();
  const hrMin = lower.match(/(\d+)\s*h(?:r|our)?s?\s*(\d+)\s*m/);
  if (hrMin) return parseInt(hrMin[1] ?? '0') * 60 + parseInt(hrMin[2] ?? '0');
  const decHr = lower.match(/^(\d+\.?\d*)\s*h/);
  if (decHr) return Math.round(parseFloat(decHr[1] ?? '0') * 60);
  const mins = lower.match(/(\d+)/);
  if (mins) return parseInt(mins[1] ?? '0');
  return 60;
}

function normalize(s: string | null | undefined): string {
  return (s || '').trim().toLowerCase();
}

function computeScrapedFields(extracted: ExtractedProviderProfile): string[] {
  const fieldMap: Record<string, keyof ExtractedProviderProfile> = {
    display_name: 'providerName',
    location_text: 'location',
    about_text: 'aboutText',
    slots_text: 'slotsText',
    phone: 'phone',
    email: 'email',
    instagram: 'instagram',
    website: 'website',
  };
  return Object.entries(fieldMap)
    .filter(([, extractedKey]) => !!extracted[extractedKey])
    .map(([column]) => column);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { jobId } = await req.json();
    if (!jobId) {
      return new Response(JSON.stringify({ error: 'Missing required field: jobId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: job, error: jobError } = await supabase
      .from('provider_scrape_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: 'Job not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (job.status === 'pending') {
      await supabase
        .from('provider_scrape_jobs')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', jobId);
    } else if (job.status === 'done' || job.status === 'failed') {
      return new Response(JSON.stringify({ skipped: true, reason: `job already ${job.status}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: sources, error: sourcesError } = await supabase
      .from('provider_scrape_sources')
      .select('id, source_url')
      .eq('job_id', jobId)
      .eq('status', 'pending')
      .limit(BATCH_SIZE);

    if (sourcesError) throw new Error(sourcesError.message);

    let created = 0;
    let dupes = 0;
    let failed = 0;

    for (let i = 0; i < (sources || []).length; i++) {
      const source = sources![i]!;
      if (i > 0) await sleep(DELAY_BETWEEN_SOURCES_MS);

      try {
        // Already scraped this exact URL in a previous run — never re-import.
        const { data: existingBySourceUrl } = await supabase
          .from('providers')
          .select('id')
          .eq('source_url', source.source_url)
          .maybeSingle();
        if (existingBySourceUrl) {
          await supabase.from('provider_scrape_sources')
            .update({ status: 'done', provider_id: existingBySourceUrl.id })
            .eq('id', source.id);
          dupes++;
          continue;
        }

        const extracted = await extractProviderProfile(source.source_url);

        if (!extracted.providerName) {
          throw new Error('No business name found on this page — skipping.');
        }

        // Name+location match against anything already on the platform
        // (self-signup or previously scraped) — best-effort dedup, not exact.
        let dupeQuery = supabase
          .from('providers')
          .select('id')
          .ilike('display_name', extracted.providerName);
        if (extracted.location) {
          dupeQuery = dupeQuery.ilike('location_text', `%${extracted.location}%`);
        }
        const { data: dupeMatch } = await dupeQuery.limit(1).maybeSingle();

        if (dupeMatch) {
          await supabase.from('provider_scrape_sources')
            .update({ status: 'done', provider_id: dupeMatch.id })
            .eq('id', source.id);
          dupes++;
          continue;
        }

        const category = VALID_CATEGORIES.includes((extracted.serviceCategory || '').toUpperCase())
          ? extracted.serviceCategory!.toUpperCase()
          : 'OTHER';

        const { data: newProvider, error: insertError } = await supabase
          .from('providers')
          .insert({
            slug: generateSlug(extracted.providerName, source.id.substring(0, 8)),
            display_name: extracted.providerName,
            service_category: category,
            custom_service_type: category === 'OTHER' ? extracted.providerName : null,
            location_text: extracted.location || null,
            about_text: extracted.aboutText || null,
            slots_text: extracted.slotsText || null,
            phone: extracted.phone || null,
            email: extracted.email || null,
            instagram: extracted.instagram || null,
            website: extracted.website || null,
            is_active: true,
            is_claimed: false,
            source: 'scraped',
            source_site: job.source_site,
            source_url: source.source_url,
            scraped_at: new Date().toISOString(),
            scraped_fields: computeScrapedFields(extracted),
          })
          .select('id')
          .single();

        if (insertError || !newProvider) {
          throw new Error(insertError?.message || 'Insert failed');
        }

        const servicesPayload: Record<string, unknown>[] = [];
        let sortOrder = 0;
        for (const [categoryName, services] of Object.entries(extracted.categories || {})) {
          for (const svc of services) {
            if (!svc.name) continue;
            servicesPayload.push({
              provider_id: newProvider.id,
              category_name: categoryName,
              name: svc.name,
              description: svc.description || null,
              price: Number(svc.price) || 0,
              duration_minutes: parseDurationToMinutes(svc.duration),
              sort_order: sortOrder++,
            });
          }
        }
        if (servicesPayload.length > 0) {
          const { error: svcError } = await supabase.from('services').insert(servicesPayload);
          if (svcError) {
            console.error(`[run-scrape-job] services insert failed for provider=${newProvider.id}: ${svcError.message}`);
          }
        }

        await supabase.from('provider_scrape_sources')
          .update({ status: 'done', provider_id: newProvider.id })
          .eq('id', source.id);
        created++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[run-scrape-job] source failed url=${source.source_url}: ${message}`);
        await supabase.from('provider_scrape_sources')
          .update({ status: 'failed', error: message })
          .eq('id', source.id);
        failed++;
      }
    }

    const { count: remaining } = await supabase
      .from('provider_scrape_sources')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .eq('status', 'pending');

    await supabase
      .from('provider_scrape_jobs')
      .update({
        processed: job.processed + created + dupes + failed,
        created_count: job.created_count + created,
        skipped_dupes: job.skipped_dupes + dupes,
        failed_count: job.failed_count + failed,
        ...((remaining ?? 0) === 0 ? { status: 'done', finished_at: new Date().toISOString() } : {}),
      })
      .eq('id', jobId);

    return new Response(
      JSON.stringify({ processedThisBatch: (sources || []).length, created, dupes, failed, remaining: remaining ?? 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
