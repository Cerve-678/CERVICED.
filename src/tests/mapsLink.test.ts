import { directionsUrlFor, mapsUrlFor } from '../utils/mapsLink';

// The profile's Contact → Location row opens this for a salon/studio on
// "Always visible". It must work with or without a geocoded pin, and always
// carry the address so the maps app shows the right label.
describe('mapsUrlFor', () => {
  const pinned = { fullAddress: '12 High St, London E8 1AA', latitude: 51.54, longitude: -0.06 };
  const unpinned = { ...pinned, latitude: null, longitude: null };

  it('pins the exact spot in Apple Maps when the address was geocoded', () => {
    expect(mapsUrlFor(pinned, 'ios')).toBe(
      'https://maps.apple.com/?q=12%20High%20St%2C%20London%20E8%201AA&ll=51.54,-0.06',
    );
  });

  it('searches the address text when there is no pin', () => {
    expect(mapsUrlFor(unpinned, 'ios')).toBe('https://maps.apple.com/?q=12%20High%20St%2C%20London%20E8%201AA');
    expect(mapsUrlFor(unpinned, 'android')).toBe(
      'https://www.google.com/maps/search/?api=1&query=12%20High%20St%2C%20London%20E8%201AA',
    );
  });

  it('uses Google Maps coordinates off iOS', () => {
    expect(mapsUrlFor(pinned, 'android')).toBe('https://www.google.com/maps/search/?api=1&query=51.54,-0.06');
  });
});

describe('directionsUrlFor', () => {
  const addressOnly = { fullAddress: '12 High St, London E8 1AA' };

  it('opens route planning for an address without coordinates', () => {
    expect(directionsUrlFor(addressOnly, 'ios')).toBe('https://maps.apple.com/?daddr=12%20High%20St%2C%20London%20E8%201AA');
    expect(directionsUrlFor(addressOnly, 'android')).toBe('https://www.google.com/maps/dir/?api=1&destination=12%20High%20St%2C%20London%20E8%201AA');
  });

  it('uses the address even if the booking carries an approximate pin', () => {
    const bookingWithPin = { ...addressOnly, latitude: 51.54, longitude: -0.06 };
    expect(directionsUrlFor(bookingWithPin, 'ios')).toBe('https://maps.apple.com/?daddr=12%20High%20St%2C%20London%20E8%201AA');
  });
});
