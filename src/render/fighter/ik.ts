import { Quaternion, Vector3, type Object3D } from 'three';

const _pa = new Vector3();
const _pb = new Vector3();
const _pc = new Vector3();
const _t = new Vector3();
const _dir = new Vector3();
const _up = new Vector3();
const _elbow = new Vector3();
const _from = new Vector3();
const _to = new Vector3();
const _q = new Quaternion();
const _qw = new Quaternion();
const _qp = new Quaternion();

/** Rotates `bone` (in world space) so that the world direction `from` turns into `to`. */
function aim(bone: Object3D, from: Vector3, to: Vector3, weight: number): void {
  _q.setFromUnitVectors(from, to);
  if (weight < 1) _q.slerp(_qw.identity(), 1 - weight);
  bone.getWorldQuaternion(_qw);
  _qw.premultiply(_q);
  bone.parent!.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(_qw));
  bone.updateMatrixWorld(true);
}

/**
 * Analytic two-bone IK (hip-knee-ankle, shoulder-elbow-wrist) in world space.
 * Bends towards `pole`; pass the current FK middle-joint position nudged
 * forward to keep the animated bend direction. Bones keep their lengths, the
 * chain is clamped just short of full extension so knees never snap straight.
 */
export function solveTwoBone(a: Object3D, b: Object3D, c: Object3D, target: Vector3, pole: Vector3, weight = 1): void {
  if (weight <= 0.001) return;
  a.getWorldPosition(_pa);
  b.getWorldPosition(_pb);
  c.getWorldPosition(_pc);
  const l1 = _pa.distanceTo(_pb);
  const l2 = _pb.distanceTo(_pc);
  _t.copy(target);
  _dir.subVectors(_t, _pa);
  let d = _dir.length();
  if (d < 1e-5) return;
  _dir.divideScalar(d);
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.9995);
  // Bend direction: the pole projected perpendicular to the chain.
  _up.subVectors(pole, _pa);
  _up.addScaledVector(_dir, -_up.dot(_dir));
  if (_up.lengthSq() < 1e-8) _up.set(0, 1, 0).addScaledVector(_dir, -_dir.y);
  _up.normalize();
  const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  _elbow.copy(_pa).addScaledVector(_dir, cosA * l1).addScaledVector(_up, sinA * l1);

  _from.subVectors(_pb, _pa).normalize();
  _to.subVectors(_elbow, _pa).normalize();
  aim(a, _from, _to, weight);

  b.getWorldPosition(_pb);
  c.getWorldPosition(_pc);
  _from.subVectors(_pc, _pb).normalize();
  _to.copy(_pa).addScaledVector(_dir, d).sub(_pb).normalize();
  aim(b, _from, _to, weight);
}

/** Sets a bone's world rotation (blended by weight) keeping its parent. */
export function setWorldQuaternion(bone: Object3D, q: Quaternion, weight = 1): void {
  bone.parent!.getWorldQuaternion(_qp);
  _qw.copy(_qp).invert().multiply(q);
  if (weight >= 1) bone.quaternion.copy(_qw);
  else bone.quaternion.slerp(_qw, weight);
  bone.updateMatrixWorld(true);
}
