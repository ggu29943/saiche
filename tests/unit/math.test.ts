import { test, expect } from 'vitest';
import { qRot, qFromYaw, qMul, type Q } from '@/math/quat';
import { wrapAngle, pmod } from '@/math/scalar';
test('rotations compose in body-to-world order', () => {
  const yaw = qFromYaw(Math.PI/2);
  const pitch: Q = [Math.SQRT1_2, Math.SQRT1_2, 0, 0];
  qRot(yaw,[0,0,1]).forEach((v,i) => expect(v).toBeCloseTo([1,0,0][i],12));
  const sequential = qRot(yaw,qRot(pitch,[0,1,0]));
  qRot(qMul(yaw,pitch),[0,1,0]).forEach((v,i) => expect(v).toBeCloseTo(sequential[i],12));
});
test('angles and negative remainders', () => {
  expect(wrapAngle(3*Math.PI)).toBeCloseTo(-Math.PI);
  expect(pmod(-1,4)).toBe(3);
});
