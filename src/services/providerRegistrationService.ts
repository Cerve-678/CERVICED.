// src/services/providerRegistrationService.ts
// Phase 2: Provider registration — save to and load from Supabase
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

// ── Shared types (mirror InfoRegScreen / ProviderMyProfileScreen) ───────────

export interface AddOnData {
  id: number;
  name: string;
  price: number;
}

export interface ServiceData {
  id: number;
  name: string;
  price: number;
  duration: string;
  description: string;
  images: string[];
  addOns: AddOnData[];
}

export interface ProviderRegistrationData {
  providerName: string;
  providerService: string;
  customServiceType: string;
  location: string;
  aboutText: string;
  slotsText: string;
  gradient: [string, string, ...string[]];
  accentColor: string;
  logo: string | null;
  categories: Record<string, ServiceData[]>;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function isLocalUri(uri: string): boolean {
  return (
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    uri.startsWith('ph://')
  );
}

async function uploadToStorage(
  bucket: string,
  storagePath: string,
  localUri: string
): Promise<string> {
  const ext = localUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

  // Use expo-file-system to read the local file reliably on both iOS and Android.
  // fetch(localUri) can fail with "Network request failed" for file:// URIs in RN.
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Decode base64 → Uint8Array (no extra packages needed)
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType, upsert: true });

  if (error) throw new Error(`Upload failed (${bucket}/${storagePath}): ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return data.publicUrl;
}

function parseDurationToMinutes(duration: string): number {
  if (!duration) return 60;
  const lower = duration.toLowerCase().trim();
  // "1 hr 30 mins" / "2 hours 15 min"
  const hrMin = lower.match(/(\d+)\s*h(?:r|our)?s?\s*(\d+)\s*m/);
  if (hrMin) return parseInt(hrMin[1] ?? '0') * 60 + parseInt(hrMin[2] ?? '0');
  // "1.5 hours" / "2hrs"
  const decHr = lower.match(/^(\d+\.?\d*)\s*h/);
  if (decHr) return Math.round(parseFloat(decHr[1] ?? '0') * 60);
  // "90 mins" / "45"
  const mins = lower.match(/(\d+)/);
  if (mins) return parseInt(mins[1] ?? '0');
  return 60;
}

function minutesToDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} mins`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs} hr${hrs > 1 ? 's' : ''}`;
  return `${hrs} hr ${mins} mins`;
}

function generateSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50) || 'provider'
  );
}

// ── saveProviderToSupabase ───────────────────────────────────────────────────
// Upserts the provider row, uploads images, replaces services/images/add-ons.
// Also updates the user's role to 'provider' and refreshes the AsyncStorage cache.

export async function saveProviderToSupabase(
  userId: string,
  data: ProviderRegistrationData
): Promise<void> {
  // 1. Upload logo if it's a local file
  let logoUrl: string | null = data.logo;
  if (data.logo && isLocalUri(data.logo)) {
    logoUrl = await uploadToStorage(
      'provider-logos',
      `${userId}/logo.jpg`,
      data.logo
    );
  }

  // 2. Upsert provider row
  const { data: existingProvider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  let providerId: string;

  if (existingProvider) {
    const { error } = await supabase
      .from('providers')
      .update({
        display_name: data.providerName,
        service_category: data.providerService,
        custom_service_type: data.customServiceType || null,
        location_text: data.location,
        about_text: data.aboutText,
        slots_text: data.slotsText,
        logo_url: logoUrl,
        gradient: data.gradient,
        accent_color: data.accentColor,
        is_active: true,
      })
      .eq('id', existingProvider.id);
    if (error) throw new Error(`Provider update failed: ${error.message}`);
    providerId = existingProvider.id;
  } else {
    // Generate unique slug
    let slug = generateSlug(data.providerName);
    const { data: slugExists } = await supabase
      .from('providers')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (slugExists) slug = `${slug}-${userId.substring(0, 8)}`;

    const { data: newProvider, error } = await supabase
      .from('providers')
      .insert({
        user_id: userId,
        slug,
        display_name: data.providerName,
        service_category: data.providerService,
        custom_service_type: data.customServiceType || null,
        location_text: data.location,
        about_text: data.aboutText,
        slots_text: data.slotsText,
        logo_url: logoUrl,
        gradient: data.gradient,
        accent_color: data.accentColor,
        is_active: true,
      })
      .select('id')
      .single();
    if (error) throw new Error(`Provider insert failed: ${error.message}`);
    providerId = newProvider.id;
  }

  // 3. Update user role to 'provider'
  await supabase.from('users').update({ role: 'provider' }).eq('id', userId);

  // 4. Delete existing services (cascades to service_images + service_add_ons)
  await supabase.from('services').delete().eq('provider_id', providerId);

  // 5. Insert services, images, and add-ons
  for (const [categoryName, services] of Object.entries(data.categories)) {
    for (let sortOrder = 0; sortOrder < services.length; sortOrder++) {
      const svc = services[sortOrder];
      if (!svc) continue;

      const { data: svcRow, error: svcError } = await supabase
        .from('services')
        .insert({
          provider_id: providerId,
          category_name: categoryName,
          name: svc.name,
          description: svc.description || null,
          price: svc.price,
          duration_minutes: parseDurationToMinutes(svc.duration),
          is_active: true,
          sort_order: sortOrder,
        })
        .select('id')
        .single();
      if (svcError) throw new Error(`Service insert failed: ${svcError.message}`);

      const serviceId = svcRow.id;

      // Upload & insert service images
      for (let i = 0; i < svc.images.length; i++) {
        const imgUri = svc.images[i];
        if (!imgUri) continue;
        let imgUrl = imgUri;
        if (isLocalUri(imgUri)) {
          imgUrl = await uploadToStorage(
            'service-images',
            `${userId}/${serviceId}/${i}.jpg`,
            imgUri
          );
        }
        await supabase.from('service_images').insert({
          service_id: serviceId,
          url: imgUrl,
          sort_order: i,
        });
      }

      // Insert add-ons
      for (const addOn of svc.addOns) {
        await supabase.from('service_add_ons').insert({
          service_id: serviceId,
          name: addOn.name,
          price: addOn.price,
          is_active: true,
        });
      }
    }
  }

  // 6. Refresh AsyncStorage cache with resolved URLs
  const cached: ProviderRegistrationData = { ...data, logo: logoUrl };
  await AsyncStorage.setItem('@provider_reg_data', JSON.stringify(cached));
}

// ── loadProviderFromSupabase ─────────────────────────────────────────────────
// Fetches provider + services + images + add-ons, reconstructs ProviderRegistrationData.
// Falls back to AsyncStorage cache if Supabase returns nothing.

export async function loadProviderFromSupabase(
  userId: string
): Promise<ProviderRegistrationData | null> {
  const { data: provider, error } = await supabase
    .from('providers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('loadProviderFromSupabase error:', error.message);
    return getCachedProviderData();
  }
  if (!provider) return getCachedProviderData();

  const { data: services, error: svcError } = await supabase
    .from('services')
    .select(`
      id,
      category_name,
      name,
      description,
      price,
      duration_minutes,
      sort_order,
      service_images ( url, sort_order ),
      service_add_ons ( name, price )
    `)
    .eq('provider_id', provider.id)
    .eq('is_active', true)
    .order('sort_order');

  if (svcError) {
    console.warn('loadProviderFromSupabase services error:', svcError.message);
    return getCachedProviderData();
  }

  // Reconstruct categories
  const categories: Record<string, ServiceData[]> = {};
  let localId = 1;

  for (const svc of (services || [])) {
    if (!categories[svc.category_name]) {
      categories[svc.category_name] = [];
    }

    const images = [...(svc.service_images || [])]
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((img: any) => img.url);

    const addOns = (svc.service_add_ons || []).map((ao: any, idx: number) => ({
      id: idx + 1,
      name: ao.name,
      price: Number(ao.price),
    }));

    (categories[svc.category_name] as ServiceData[]).push({
      id: localId++,
      name: svc.name,
      price: Number(svc.price),
      duration: minutesToDuration(svc.duration_minutes),
      description: svc.description || '',
      images,
      addOns,
    });
  }

  return {
    providerName: provider.display_name,
    providerService: provider.service_category,
    customServiceType: provider.custom_service_type || '',
    location: provider.location_text || '',
    aboutText: provider.about_text || '',
    slotsText: provider.slots_text || '',
    gradient: (provider.gradient || ['#FF6B6B', '#4ECDC4', '#45B7D1']) as [string, string, ...string[]],
    accentColor: provider.accent_color || '#7B1FA2',
    logo: provider.logo_url || null,
    categories,
  };
}

// ── AsyncStorage cache helpers ───────────────────────────────────────────────

export async function getCachedProviderData(): Promise<ProviderRegistrationData | null> {
  try {
    const stored = await AsyncStorage.getItem('@provider_reg_data');
    if (stored) return JSON.parse(stored) as ProviderRegistrationData;
  } catch (e) {
    console.warn('getCachedProviderData error:', e);
  }
  return null;
}
