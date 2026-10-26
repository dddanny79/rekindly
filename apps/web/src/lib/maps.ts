import type { Address } from '@app/shared';
import { formatAddress } from '@/lib/format';

export interface MapLinks {
  map: string;
  route: string;
}

/**
 * Links that open an address in the device's maps app: Apple Maps on iPhone, iPad and
 * Mac, the chosen maps app on Android (`geo:`), OpenStreetMap elsewhere. Only links:
 * the app itself never looks anything up. Null when the address has no text.
 */
export function mapLinks(address: Address, userAgent = navigator.userAgent): MapLinks | null {
  const text = formatAddress(address).join(', ');
  if (!text) return null;
  const q = encodeURIComponent(text);
  if (/iPhone|iPad|Macintosh|Mac OS X/.test(userAgent) && !/Android/.test(userAgent)) {
    return { map: `https://maps.apple.com/?q=${q}`, route: `https://maps.apple.com/?daddr=${q}` };
  }
  if (/Android/.test(userAgent)) {
    // `geo:` has no directions form; the Google Maps link opens the maps app on Android.
    return {
      map: `geo:0,0?q=${q}`,
      route: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    };
  }
  return {
    map: `https://www.openstreetmap.org/search?query=${q}`,
    route: `https://www.openstreetmap.org/directions?to=${q}`,
  };
}
