import { createServiceDraft } from '../features/provider-registration/serviceDraft';

describe('createServiceDraft', () => {
  it('preserves template defaults while resetting editable booking details', () => {
    const draft = createServiceDraft({
      name: 'Skin consultation',
      duration: '30 min',
      serviceType: 'consultation',
      techniqueTags: ['skin-analysis'],
    });

    expect(draft).toMatchObject({
      name: 'Skin consultation',
      duration: '30 min',
      serviceType: 'consultation',
      price: 0,
      images: [],
      addOns: [],
      patchTestRequired: false,
    });
  });
});
