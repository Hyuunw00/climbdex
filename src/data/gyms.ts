import raw from '../../data/gyms.json';

export type Gym = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  region1: string;
  region2: string;
  category: string;
  phone: string | null;
  placeUrl: string;
  kind: string;
  image: string | null;
  no: number;
};

export const gyms: Gym[] = (raw as Omit<Gym, 'no'>[]).map((g, i) => ({ ...g, no: i + 1 }));

export function formatNo(no: number) {
  return `#${String(no).padStart(3, '0')}`;
}

export const gymById = new Map(gyms.map((g) => [g.id, g]));

export const regions: string[] = (() => {
  const counts = new Map<string, number>();
  for (const g of gyms) counts.set(g.region1, (counts.get(g.region1) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
})();

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(s));
}

export function nearestGym(lat: number, lng: number): { gym: Gym; distance: number } | null {
  let best: { gym: Gym; distance: number } | null = null;
  for (const gym of gyms) {
    const distance = distanceMeters(lat, lng, gym.lat, gym.lng);
    if (!best || distance < best.distance) best = { gym, distance };
  }
  return best;
}
