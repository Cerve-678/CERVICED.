import { providerContactOptions } from '../features/providers/contactOptions';

const none = { phone: '', whatsapp: '', email: '', instagram: '', website: '', tiktok: '' };

describe('the ways to reach a provider (app sheet and website Get In Touch)', () => {
  it('offers only what they publish, in the Contact card order', () => {
    const options = providerContactOptions({ ...none, email: 'hi@studio.co', phone: '07700 900123', instagram: 'studio' });
    expect(options.map(o => o.key)).toEqual(['phone', 'email', 'instagram']);
  });

  it('builds links a phone can open', () => {
    const options = providerContactOptions({ ...none, phone: '07700 900123', whatsapp: '+44 7700 900123', tiktok: 'studio' });
    expect(options.map(o => o.url)).toEqual(['sms:07700900123', 'https://wa.me/+447700900123', 'https://tiktok.com/@studio']);
  });

  it('gives a website typed without https:// a link that opens, and drops one that can\'t be a page', () => {
    expect(providerContactOptions({ ...none, website: 'studio.co.uk' })[0]?.url).toBe('https://studio.co.uk/');
    expect(providerContactOptions({ ...none, website: 'not a site' })).toEqual([]);
  });

  it('offers nothing when nothing is published', () => {
    expect(providerContactOptions(none)).toEqual([]);
  });
});
