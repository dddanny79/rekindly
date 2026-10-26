import { describe, expect, it } from 'vitest';
import type { Address } from '@app/shared';
import { mapLinks } from './maps';

const ADDRESS: Address = {
  id: 'a1',
  label: 'Work',
  street: 'Lindenstraße 12',
  zip: '10969',
  city: 'Berlin',
  region: null,
  country: 'Germany',
};
const QUERY = 'Lindenstra%C3%9Fe%2012%2C%2010969%20Berlin%2C%20Germany';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

describe('mapLinks', () => {
  it('uses Apple Maps on iPhone and Mac', () => {
    for (const ua of [IPHONE, MAC]) {
      expect(mapLinks(ADDRESS, ua)).toEqual({
        map: `https://maps.apple.com/?q=${QUERY}`,
        route: `https://maps.apple.com/?daddr=${QUERY}`,
      });
    }
  });

  it('hands the address to the maps app on Android', () => {
    expect(mapLinks(ADDRESS, ANDROID)).toEqual({
      map: `geo:0,0?q=${QUERY}`,
      route: `https://www.google.com/maps/dir/?api=1&destination=${QUERY}`,
    });
  });

  it('uses OpenStreetMap elsewhere', () => {
    expect(mapLinks(ADDRESS, WINDOWS)).toEqual({
      map: `https://www.openstreetmap.org/search?query=${QUERY}`,
      route: `https://www.openstreetmap.org/directions?to=${QUERY}`,
    });
  });

  it('leaves out the label and has no links without text', () => {
    expect(mapLinks({ ...ADDRESS, street: null, zip: null, country: null }, WINDOWS)?.map).toBe(
      'https://www.openstreetmap.org/search?query=Berlin',
    );
    expect(
      mapLinks(
        { ...ADDRESS, street: null, zip: null, city: null, region: null, country: null },
        WINDOWS,
      ),
    ).toBeNull();
  });
});
