import {
  clientPreviewNames,
  countClients,
  formsNotYetSent,
  hasPlaceholder,
  hasSection,
  insertSection,
  isHeadingLine,
  packCoversService,
  packServiceLabel,
  packsNotYetSent,
  splitUpcomingForPack,
  summarizeDeliveries,
} from '../features/info-packs/infoPackLogic';
import {
  allPackTemplates,
  packTemplatesFor,
  rankPackTemplates,
  servicesForTemplate,
} from '../features/info-packs/packTemplates';

const TODAY = '2026-11-06';
const booking = (id: string, service: string, date = '2026-11-10', status = 'confirmed', user_id: string | null = `u-${id}`) => ({
  id, service_name_snapshot: service, booking_date: date, status, user_id, customer_name: `Client ${id}`,
});

describe('which bookings a pack is for', () => {
  it('matches named services, and every service when none are named', () => {
    expect(packCoversService(['Lash Lift'], 'Lash Lift')).toBe(true);
    expect(packCoversService(['Lash Lift'], 'Volume Fill')).toBe(false);
    expect(packCoversService([], 'Anything')).toBe(true);
    expect(packCoversService(['Lash Lift'], null)).toBe(false);
  });

  it('only offers upcoming, still-happening bookings, matching ones first', () => {
    const rows = [
      booking('1', 'Lash Lift'),
      booking('2', 'Volume Fill'),
      booking('3', 'Lash Lift', '2026-11-01'), // past
      booking('4', 'Lash Lift', '2026-11-12', 'cancelled'),
      booking('5', 'Lash Lift', TODAY, 'pending'),
    ];
    const { matching, other } = splitUpcomingForPack(rows, ['Lash Lift'], TODAY);
    expect(matching.map(b => b.id)).toEqual(['1', '5']);
    expect(other.map(b => b.id)).toEqual(['2']);
  });

  it('counts people, not bookings', () => {
    const rows = [booking('1', 'A', undefined, 'confirmed', 'same'), booking('2', 'A', undefined, 'confirmed', 'same'), booking('3', 'A', undefined, 'confirmed', null)];
    expect(countClients(rows)).toBe(2);
    expect(clientPreviewNames(rows)).toBe('Client, Client');
  });

  it('shortens the names line after three', () => {
    const rows = ['Beth Ray', 'Dani', 'Esme', 'Farah'].map((n, i) => ({ ...booking(String(i), 'A'), customer_name: n }));
    expect(clientPreviewNames(rows)).toBe('Beth, Dani, Esme +1');
  });
});

describe('sent and opened counts', () => {
  it('counts each booking once and opened only when read', () => {
    const reach = summarizeDeliveries([
      { infoPackId: 'p', bookingId: 'b1', viewedAt: '2026-11-01' },
      { infoPackId: 'p', bookingId: 'b1', viewedAt: null },
      { infoPackId: 'p', bookingId: 'b2', viewedAt: null },
      { infoPackId: 'q', bookingId: 'b3', viewedAt: null },
    ]);
    expect(reach['p']).toMatchObject({ sent: 2, opened: 1 });
    expect(reach['q']).toMatchObject({ sent: 1, opened: 0 });
    expect([...reach['p']!.bookingIds]).toEqual(['b1', 'b2']);
  });

  it('labels services the way the card pill does', () => {
    expect(packServiceLabel([])).toBe('All services');
    expect(packServiceLabel(['Lash Lift'])).toBe('Lash Lift');
    expect(packServiceLabel(['Lash Lift', 'Fill', 'Tint'])).toBe('Lash Lift +2');
  });
});

describe('sections inside a pack', () => {
  it('adds a heading once, after a blank line', () => {
    const once = insertSection('Keep it dry.', 'AFTERCARE');
    expect(once).toBe('Keep it dry.\n\nAFTERCARE\n');
    expect(insertSection(once, 'AFTERCARE')).toBe(once);
    expect(insertSection('', 'WHAT TO BRING')).toBe('WHAT TO BRING\n');
    expect(hasSection(once, 'AFTERCARE')).toBe(true);
  });

  it('tells headings from shouted sentences', () => {
    expect(isHeadingLine('BEFORE YOUR APPOINTMENT')).toBe(true);
    expect(isHeadingLine('DO NOT GET THEM WET!')).toBe(false);
    expect(isHeadingLine('Keep lashes dry.')).toBe(false);
  });

  it('spots leftover example blanks', () => {
    expect(hasPlaceholder('Fills every [add your usual number] weeks')).toBe(true);
    expect(hasPlaceholder('Fills every 3 weeks')).toBe(false);
  });
});

describe('what a booking is still missing', () => {
  it('suggests packs that cover the service and are not on it yet', () => {
    const packs = [
      { id: 'a', title: 'Lift aftercare', service_names: ['Lash Lift'] },
      { id: 'b', title: 'What to bring', service_names: [] },
      { id: 'c', title: 'Brow care', service_names: ['Brow Tint'] },
    ];
    expect(packsNotYetSent(packs, ['b'], 'Lash Lift').map(p => p.id)).toEqual(['a']);
  });

  it('suggests forms by library id, falling back to title for older sends', () => {
    const library = [
      { id: 'f1', title: 'Lash consultation', serviceNames: ['Lash Lift'] },
      { id: 'f2', title: 'Patch test consent', serviceNames: [] },
      { id: 'f3', title: 'Brow form', serviceNames: ['Brow Tint'] },
    ];
    expect(formsNotYetSent(library, [{ libraryFormId: null, title: 'Patch Test Consent ' }], 'Lash Lift').map(f => f.id)).toEqual(['f1']);
    expect(formsNotYetSent(library, [{ libraryFormId: 'f1', title: 'Renamed' }], 'Lash Lift').map(f => f.id)).toEqual(['f2']);
  });
});

describe('example packs', () => {
  it('has examples for every service type, at least five each', () => {
    const cats = ['HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'MALE', 'KIDS', 'OTHER'];
    for (const c of cats) expect(packTemplatesFor([c]).length).toBeGreaterThanOrEqual(5);
    expect(new Set(allPackTemplates().map(t => t.id)).size).toBe(allPackTemplates().length);
  });

  it('falls back to the general set for an unknown type', () => {
    expect(packTemplatesFor([]).every(t => t.category === 'OTHER')).toBe(true);
  });

  it('keeps money and medical claims out of the copy', () => {
    for (const tpl of allPackTemplates()) {
      expect(tpl.content).not.toMatch(/\b(deposit|balance|refund)s?\b|£|\bpay\b/i);
      expect(tpl.content).not.toMatch(/guarantee|safe for|cure|treat(s)? /i);
    }
  });

  it('leaves patch tests and allergies as blanks for the provider', () => {
    for (const tpl of allPackTemplates()) {
      for (const line of tpl.content.split('\n')) {
        if (/patch test|allerg/i.test(line)) expect(line).toMatch(/^\[.*\]$/);
      }
    }
  });

  it("ranks by the provider's services, then by what they type", () => {
    const lashes = packTemplatesFor(['LASHES']);
    expect(rankPackTemplates(lashes, ['Lash Lift & Tint'], { title: '', content: '' })[0]!.id).toBe('lashes-lift-after');
    // Typing "volume" brings the volume examples forward, past the lift one.
    const typed = rankPackTemplates(lashes, ['Lash Lift & Tint'], { title: 'volume', content: '' });
    expect(typed.slice(0, 2).map(t => t.id).sort()).toEqual(['lashes-before', 'lashes-ext-after']);
  });

  it('drops the example already in the content box to the end', () => {
    const lashes = packTemplatesFor(['LASHES']);
    const lift = lashes.find(t => t.id === 'lashes-lift-after')!;
    const ranked = rankPackTemplates(lashes, ['Lash Lift'], { title: lift.title, content: lift.content });
    expect(ranked[ranked.length - 1]!.id).toBe('lashes-lift-after');
  });

  it("pre-picks the provider's matching services, none for general examples", () => {
    const hair = packTemplatesFor(['HAIR']);
    const services = ['Knotless Braids', 'Full Colour', 'Silk Press'];
    expect(servicesForTemplate(hair.find(t => t.id === 'hair-braids-last')!, services)).toEqual(['Knotless Braids']);
    expect(servicesForTemplate(hair.find(t => t.id === 'hair-bring')!, services)).toEqual([]);
  });
});
