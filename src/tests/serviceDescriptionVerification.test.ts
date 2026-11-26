import { serviceDescriptionsMatch } from '../features/provider-registration/serviceDescriptionVerification';

const existing = {
  id: 'service-1', category_name: 'Manicure', sort_order: 0, description: 'Nails trimmed and shaped',
};

describe('service description publish verification', () => {
  it('accepts the exact stored wording for an existing and a newly added service', () => {
    expect(serviceDescriptionsMatch(
      [existing, { id: null, category_name: 'Pedicure', sort_order: 0, description: 'Gel finish' }],
      [existing, { id: 'service-2', category_name: 'Pedicure', sort_order: 0, description: 'Gel finish' }],
    )).toBe(true);
  });

  it('rejects an older description even when the save returned rows', () => {
    expect(serviceDescriptionsMatch(
      [{ ...existing, description: 'New details they typed' }],
      [existing],
    )).toBe(false);
  });

  it('rejects a missing service and a different row at the same position', () => {
    expect(serviceDescriptionsMatch([existing], [])).toBe(false);
    expect(serviceDescriptionsMatch([existing], [{ ...existing, id: 'other-service' }])).toBe(false);
  });

  it('treats an empty description and SQL null as the same value', () => {
    expect(serviceDescriptionsMatch(
      [{ ...existing, description: null }],
      [{ ...existing, description: '' }],
    )).toBe(true);
  });
});
