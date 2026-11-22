import { pmod } from '@/math/scalar';
import type { Track } from '@/track/track';
import type { Vehicle } from './vehicle';

export function resetToTrack(vehicle: Vehicle, track: Track, s: number) {
  const i = pmod(Math.round(s / track.step), track.count);
  const [x, y, z] = track.pos[i];
  const tangent = track.tan[i];
  vehicle.reset([x, track.height(x, z) ?? y, z], Math.atan2(tangent[0], tangent[2]));
}
