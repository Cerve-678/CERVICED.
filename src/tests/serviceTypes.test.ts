import fs from 'fs';
import path from 'path';
import {
  SERVICE_TYPE_KEYS,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPES_BY_KIND,
  isServiceTypeKey,
  serviceTypeOptionsFor,
} from '../constants/serviceTypes';
import { CATEGORY_KINDS } from '../features/providers/serviceTags';

const MIGRATION = path.join(__dirname, '../../supabase/migrations/20261110190000_more_service_types.sql');

describe('service types', () => {
  it('match the values services_service_type_check allows', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    const added = sql.match(/ADD CONSTRAINT services_service_type_check[\s\S]*?ARRAY\[([\s\S]*?)\]::text\[\]/);
    expect(added).not.toBeNull();
    const inSql = [...(added?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    expect([...inSql].sort()).toEqual([...SERVICE_TYPE_KEYS].sort());
  });

  it('keep the five original values, consultation included', () => {
    for (const key of ['treatment', 'enhancement', 'maintenance', 'restorative', 'consultation']) {
      expect(isServiceTypeKey(key)).toBe(true);
    }
  });

  it('give every kind of service its own choices, all labelled, with consultation offered', () => {
    for (const kind of CATEGORY_KINDS) {
      const keys = SERVICE_TYPES_BY_KIND[kind];
      expect(keys.length).toBeGreaterThan(4);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toContain('consultation');
      for (const key of keys) expect(SERVICE_TYPE_LABELS[key]).toBeTruthy();
    }
    expect(SERVICE_TYPES_BY_KIND.LASHES).toEqual(expect.arrayContaining(['full_set', 'infill', 'removal']));
    expect(SERVICE_TYPES_BY_KIND.MUA).toEqual(expect.arrayContaining(['occasion', 'trial', 'lesson']));
    expect(SERVICE_TYPES_BY_KIND.MUA).not.toContain('infill');
  });

  it('keep a saved type the kind does not offer, at the end', () => {
    const options = serviceTypeOptionsFor('MUA', 'infill');
    expect(options[options.length - 1]).toEqual({ value: 'infill', label: 'Infill / Refill' });
    expect(serviceTypeOptionsFor('MUA', '').map(o => o.value)).toEqual([...SERVICE_TYPES_BY_KIND.MUA]);
  });
});
