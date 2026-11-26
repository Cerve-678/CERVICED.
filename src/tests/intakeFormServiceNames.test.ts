import { readFileSync } from 'fs';
import { join } from 'path';

// Forms link to services by name. Two services sharing a name (a template like
// "Skin Consultation" added in two categories) must show as one chip, or React
// warns "two children with the same key" and the chips can duplicate or vanish.
describe('Forms screen service chips', () => {
  const screen = readFileSync(join(__dirname, '../screens/provider/ProviderIntakeFormScreen.tsx'), 'utf8');

  it('lists each service name once', () => {
    expect(screen).toContain('const svcNames = [...new Set(services.map(s => s.name))];');
  });

  it('shows each linked service once on a form card, and counts the rest the same way', () => {
    expect(screen).toContain('const linkedServices = useMemo(() => [...new Set(form.serviceNames)], [form.serviceNames]);');
    expect(screen).toContain('{linkedServices.slice(0, 3).map(name => (');
    expect(screen).toContain('+{linkedServices.length - 3} more');
  });
});
