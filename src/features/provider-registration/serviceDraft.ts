export type ProviderServiceType = 'treatment' | 'enhancement' | 'maintenance' | 'restorative' | 'consultation' | '';

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
  name: string;
  price: number;
  duration: string;
  bufferBeforeMins: number | null;
  bufferAfterMins: number | null;
  description: string;
  images: string[];
  addOns: { id: number; name: string; price: number }[];
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
    name: template?.name ?? '',
    price: 0,
    duration: template?.duration ?? '',
    bufferBeforeMins: null,
    bufferAfterMins: null,
    description: template?.description ?? '',
    images: [],
    addOns: [],
    tags: template?.styleTags ?? [],
    techniqueTags: template?.techniqueTags ?? [],
    outcomeTags: template?.outcomeTags ?? [],
    occasionTags: template?.occasionTags ?? [],
    trendNames: template?.trendNames ?? [],
    isPregnancySafe: false,
    patchTestRequired: false,
    minAge: null,
    contraindications: [],
    aftercareNotes: '',
    serviceType: template?.serviceType ?? '',
  };
}
