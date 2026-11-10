import type { ServiceImageDraft } from '../../services/providerRegistrationService';
import type { ServiceTypeKey } from '../../constants/serviceTypes';

export type ProviderServiceType = ServiceTypeKey | '';

// '' = not stated, read as "everyone" by the app — mirrors the live
// services_audience_check constraint (NULL or one of these three values).
export type ProviderServiceAudience = 'women' | 'men' | 'kids' | 'everyone' | '';

export interface ServiceTemplateSeed {
  name?: string;
  duration?: string;
  description?: string;
  styleTags?: string[];
  techniqueTags?: string[];
  outcomeTags?: string[];
  occasionTags?: string[];
  trendNames?: string[];
  serviceType?: ProviderServiceType;
}

export interface ProviderServiceDraft {
  id: number;
  dbId: string | null;
  name: string;
  price: number;
  duration: string;
  bufferBeforeMins: number | null;
  bufferAfterMins: number | null;
  description: string;
  images: ServiceImageDraft[];
  /** Keys of the provider's add-ons ticked on this service. */
  addOnKeys: string[];
  tags: string[];
  techniqueTags: string[];
  outcomeTags: string[];
  occasionTags: string[];
  trendNames: string[];
  isPregnancySafe: boolean;
  patchTestRequired: boolean;
  minAge: number | null;
  contraindications: string[];
  aftercareNotes: string;
  serviceType: ProviderServiceType;
  hairTypesSuitable: string[];
  skinTonesSuitable?: string[];
  audience: ProviderServiceAudience;
}

// Date.now() alone can return the same millisecond for two drafts created in
// quick succession (e.g. picking the same generic template for two
// categories back-to-back), which then collide as duplicate React keys once
// both land in providerData.categories. This counter guarantees uniqueness
// within the session regardless of timing.
let draftIdCounter = 0;

function nextDraftId(): number {
  draftIdCounter += 1;
  return Date.now() * 1000 + (draftIdCounter % 1000);
}

/** Creates a fresh service draft, retaining any selected template defaults. */
export function createServiceDraft(template?: ServiceTemplateSeed | null): ProviderServiceDraft {
  return {
    id: nextDraftId(),
    dbId: null,
    name: template?.name ?? '',
    price: 0,
    duration: template?.duration ?? '',
    bufferBeforeMins: null,
    bufferAfterMins: null,
    description: template?.description ?? '',
    images: [],
    addOnKeys: [],
    tags: template?.styleTags ?? [],
    techniqueTags: template?.techniqueTags ?? [],
    outcomeTags: template?.outcomeTags ?? [],
    occasionTags: template?.occasionTags ?? [],
    trendNames: template?.trendNames ?? [],
    // Off-by-default toggle FLAGS a service as unsafe; an untouched service is
    // treated as safe (no warning), so the draft starts safe rather than
    // asserting "not recommended during pregnancy" on every new service.
    isPregnancySafe: true,
    patchTestRequired: false,
    minAge: null,
    contraindications: [],
    aftercareNotes: '',
    serviceType: template?.serviceType ?? '',
    hairTypesSuitable: [],
    skinTonesSuitable: [],
    audience: '',
  };
}

type ServiceIdentity = { id: number; dbId: string | null };

/**
 * Puts an edited service back into its category's list.
 *
 * The local `id` is only a number handed out when the profile was read, and
 * the cached copy and the live refresh hand them out separately. A service
 * editor opened on the cached copy can therefore come back with an `id` the
 * refreshed list no longer has. Matching on the saved row's `dbId` as well
 * replaces the original instead of appending a second copy. Two copies with
 * the same `dbId` made replace_provider_services write one row twice, so the
 * publish check found one service fewer than it sent.
 */
export function upsertServiceInList<S extends ServiceIdentity>(list: readonly S[], service: S): S[] {
  const sameService = (s: S) => s.id === service.id || (!!service.dbId && s.dbId === service.dbId);
  const index = list.findIndex(sameService);
  if (index < 0) return [...list, service];
  return list.flatMap((s, i) => (i === index ? [service] : sameService(s) ? [] : [s]));
}

/**
 * One entry per saved service, for a list that already holds copies of the
 * same row. The last copy is the most recent edit. It is also the copy the
 * database would have kept, since the save RPC applies entries in order.
 * It takes the place of the first copy, so the menu order stays the same.
 */
export function collapseDuplicateSavedServices<S extends ServiceIdentity>(list: readonly S[]): S[] {
  const lastByDbId = new Map<string, S>();
  for (const s of list) if (s?.dbId) lastByDbId.set(s.dbId, s);
  const placed = new Set<string>();
  const out: S[] = [];
  for (const s of list) {
    if (!s?.dbId) { out.push(s); continue; }
    if (placed.has(s.dbId)) continue;
    placed.add(s.dbId);
    out.push(lastByDbId.get(s.dbId) as S);
  }
  return out;
}
