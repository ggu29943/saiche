import { expect, test } from 'vitest';
import valley from '../../reference/golden/track_valley.json';
import coast from '../../reference/golden/track_coast.json';
import { TRACKS, TRACK_IDS } from '@/data';
import { Track } from '@/track/track';

function close(actual: number, expected: number, field: string) {
  expect(Math.abs(actual - expected), field).toBeLessThanOrEqual(1e-6);
}
function vector(actual: number[], expected: number[], field: string) {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, axis) => close(actual[axis], value, field + '[' + axis + ']'));
}

test.each(TRACK_IDS)('%s matches reference geometry and surface probes', id => {
  const track = new Track(TRACKS[id]);
  const golden = { valley, coast }[id];
  close(track.length, golden.length, 'length');
  expect(track.count).toBe(golden.count);
  expect(track.kerb.filter(Boolean).length).toBe(golden.kerbCount);
  for (const [key, sample] of Object.entries(golden.samples)) {
    const i = Number(key);
    vector(track.pos[i], sample.pos, key + '.pos');
    vector(track.left[i], sample.left, key + '.left');
    close(track.hw[i], sample.hw, key + '.hw');
    close(track.curv[i], sample.curv, key + '.curv');
    expect(track.kerb[i]).toBe(sample.kerb);
  }
  for (const [i, probe] of golden.probes.entries()) {
    const { x, z } = probe;
    const hit = track.query(x,z);
    close(hit.height, probe.height, 'height ' + i);
    vector(hit.normal, probe.normal, 'normal ' + i);
    expect(hit.surface).toBe(probe.surface);
    const projection = track.project(x,z);
    expect(projection).not.toBeNull();
    close(projection!.s, probe.progress, 'progress ' + i);
  }
});
