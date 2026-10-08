import { MAT, type Sdf, type Vec3 } from './sdf';

/**
 * Surface-nets mesher for sculpt fields. One vertex per surface cell, snapped
 * onto the true surface with Newton steps and shaded with the field gradient,
 * so even a modest grid gives smooth, accurate meshes. Only blocks near the
 * surface are evaluated finely (narrow band), which keeps a full body in the
 * tens of milliseconds. Per vertex it also bakes:
 *  - `ao`: ambient occlusion from the field itself (creases, armpits, under the jaw),
 *  - `curv`: signed curvature (positive on ridges, negative in grooves), which
 *    the painter uses for figurine-style edge highlights and recess washes.
 */
export interface SculptMesh {
  pos: Float32Array;
  nor: Float32Array;
  mat: Uint8Array;
  ao: Float32Array;
  curv: Float32Array;
  idx: Uint32Array;
  count: number;
}

export interface MeshOpts {
  /** Grid spacing (metres). */
  h: number;
  /** Bounds to mesh; defaults to the field's own bounds. */
  bb?: ArrayLike<number>;
  /** Distance scale of the AO probe (0 disables AO). */
  ao?: number;
}

const B = 4; // cells per block edge

export function meshSdf(f: Sdf, o: MeshOpts): SculptMesh {
  const h = o.h;
  const bb = o.bb ?? f.bb;
  const ox = bb[0] - 2 * h, oy = bb[1] - 2 * h, oz = bb[2] - 2 * h;
  const nbx = Math.max(1, Math.ceil((bb[3] - bb[0] + 4 * h) / (h * B)));
  const nby = Math.max(1, Math.ceil((bb[4] - bb[1] + 4 * h) / (h * B)));
  const nbz = Math.max(1, Math.ceil((bb[5] - bb[2] + 4 * h) / (h * B)));
  const nx = nbx * B + 1, ny = nby * B + 1, nz = nbz * B + 1;
  const sxy = nx * ny;
  const val = new Float32Array(nx * ny * nz);
  const exact = new Uint8Array(nx * ny * nz);
  const active = new Uint8Array(nbx * nby * nbz);
  const rad = Math.sqrt(3) * (B / 2) * h;
  const aoK = o.ao ?? 0;
  /** Each block evaluates a tree pruned to what can reach it (incl. AO probes). */
  const reach = Math.max(aoK * 3, rad) + 0.012;
  const trees: (Sdf | null)[] = new Array(nbx * nby * nbz).fill(null);
  const lo: Vec3 = [0, 0, 0], hi: Vec3 = [0, 0, 0];

  // 1. Coarse pass: block centres decide which blocks straddle the surface.
  for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    const cx = ox + (bi * B + B / 2) * h, cy = oy + (bj * B + B / 2) * h, cz = oz + (bk * B + B / 2) * h;
    const bidx = bi + bj * nbx + bk * nbx * nby;
    const half = (B / 2) * h + reach;
    lo[0] = cx - half; lo[1] = cy - half; lo[2] = cz - half;
    hi[0] = cx + half; hi[1] = cy + half; hi[2] = cz + half;
    const tree = f.prune(lo, hi);
    const d = tree ? tree.d(cx, cy, cz) : reach;
    if (tree && Math.abs(d) < rad * 1.35 + h) { active[bidx] = 1; trees[bidx] = tree; continue; }
    // Far from the surface: every corner shares the centre's sign.
    const approx = d > 0 ? Math.max(h, d - rad) : Math.min(-h, d + rad);
    for (let k = 0; k <= B; k++) for (let j = 0; j <= B; j++) for (let i = 0; i <= B; i++) {
      const gi = bi * B + i + (bj * B + j) * nx + (bk * B + k) * sxy;
      if (!exact[gi]) val[gi] = approx;
    }
  }
  // 2. Inside active blocks, 2x2x2-cell sub-blocks near the surface get exact corner values.
  const sb = B / 2;
  const snx = nbx * 2, sny = nby * 2;
  const subOn = new Uint8Array(snx * sny * nbz * 2);
  const rad2 = Math.sqrt(3) * h;
  for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    const tree = trees[bi + bj * nbx + bk * nbx * nby];
    if (!tree) continue;
    for (let sk = 0; sk < 2; sk++) for (let sj = 0; sj < 2; sj++) for (let si = 0; si < 2; si++) {
      const x0 = bi * B + si * sb, y0 = bj * B + sj * sb, z0 = bk * B + sk * sb;
      const d = tree.d(ox + (x0 + 1) * h, oy + (y0 + 1) * h, oz + (z0 + 1) * h);
      if (Math.abs(d) < rad2 * 1.3 + h * 0.3) {
        subOn[(bi * 2 + si) + (bj * 2 + sj) * snx + (bk * 2 + sk) * snx * sny] = 1;
        for (let k = 0; k <= sb; k++) for (let j = 0; j <= sb; j++) for (let i = 0; i <= sb; i++) {
          const gx = x0 + i, gy = y0 + j, gz = z0 + k;
          const gi = gx + gy * nx + gz * sxy;
          if (exact[gi]) continue;
          val[gi] = tree.d(ox + gx * h, oy + gy * h, oz + gz * h);
          exact[gi] = 1;
        }
      } else {
        const approx = d > 0 ? Math.max(h * 0.5, d - rad2) : Math.min(-h * 0.5, d + rad2);
        for (let k = 0; k <= sb; k++) for (let j = 0; j <= sb; j++) for (let i = 0; i <= sb; i++) {
          const gi = x0 + i + (y0 + j) * nx + (z0 + k) * sxy;
          if (!exact[gi]) val[gi] = approx;
        }
      }
    }
  }

  // 3. One vertex per cell that the surface crosses.
  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
  const cellV = new Int32Array(cnx * cny * cnz).fill(-1);
  const P: number[] = [];
  const vTree: Sdf[] = [];
  const vCell: number[] = [];
  const corner = [0, 1, nx, nx + 1, sxy, sxy + 1, sxy + nx, sxy + nx + 1];
  const cOff = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v8 = new Float64Array(8);
  for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    const tree = trees[bi + bj * nbx + bk * nbx * nby];
    if (!tree) continue;
    for (let k = 0; k < B; k++) for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
      const gx = bi * B + i, gy = bj * B + j, gz = bk * B + k;
      if (!subOn[(gx >> 1) + (gy >> 1) * snx + (gz >> 1) * snx * sny]) continue;
      const g0 = gx + gy * nx + gz * sxy;
      let mask = 0;
      for (let c = 0; c < 8; c++) { v8[c] = val[g0 + corner[c]]; if (v8[c] < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of edges) {
        const va = v8[a], vb = v8[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        const A = cOff[a], Bo = cOff[b];
        sx += A[0] + (Bo[0] - A[0]) * t;
        sy += A[1] + (Bo[1] - A[1]) * t;
        sz += A[2] + (Bo[2] - A[2]) * t;
        n++;
      }
      cellV[gx + gy * cnx + gz * cnx * cny] = P.length / 3;
      vTree.push(tree);
      vCell.push(g0);
      P.push(ox + (gx + sx / n) * h, oy + (gy + sy / n) * h, oz + (gz + sz / n) * h);
    }
  }
  const count = P.length / 3;

  // 4. Snap to the surface, then shade from the gradient.
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const mat = new Uint8Array(count);
  const ao = new Float32Array(count);
  const curv = new Float32Array(count);
  const e = h * 0.35;
  let f2: Sdf = f;
  const grad = (x: number, y: number, z: number, out: Float64Array) => {
    const f = f2;
    // Tetrahedral 4-tap gradient.
    const a = f.d(x + e, y - e, z - e), b = f.d(x - e, y - e, z + e), c = f.d(x - e, y + e, z - e), d = f.d(x + e, y + e, z + e);
    out[0] = a - b - c + d; out[1] = -a - b + c + d; out[2] = -a + b - c + d;
    const l = Math.hypot(out[0], out[1], out[2]) || 1;
    out[0] /= l; out[1] /= l; out[2] /= l;
  };
  const g = new Float64Array(3);
  for (let v = 0; v < count; v++) {
    const f = f2 = vTree[v];
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const x0 = x, y0 = y, z0 = z;
    // One Newton step along the field gradient; the same gradient shades the vertex.
    const g0 = vCell[v];
    const d0 = f.d(x, y, z);
    mat[v] = MAT;
    grad(x, y, z, g);
    x -= d0 * g[0]; y -= d0 * g[1]; z -= d0 * g[2];
    // Never let the snap wander out of the cell neighbourhood (thin features).
    const mv = Math.hypot(x - x0, y - y0, z - z0);
    if (mv > h) { const s = h / mv; x = x0 + (x - x0) * s; y = y0 + (y - y0) * s; z = z0 + (z - z0) * s; }
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    nor[v * 3] = g[0]; nor[v * 3 + 1] = g[1]; nor[v * 3 + 2] = g[2];
    // Curvature: grid Laplacian at the cell's nearest exact corner.
    {
      const ci = g0 + (x - (ox + (g0 % nx) * h) > h / 2 ? 1 : 0) + (y - (oy + (Math.floor(g0 / nx) % ny) * h) > h / 2 ? nx : 0)
        + (z - (oz + Math.floor(g0 / sxy) * h) > h / 2 ? sxy : 0);
      if (exact[ci - 1] && exact[ci + 1] && exact[ci - nx] && exact[ci + nx] && exact[ci - sxy] && exact[ci + sxy]) {
        const lap = val[ci - 1] + val[ci + 1] + val[ci - nx] + val[ci + nx] + val[ci - sxy] + val[ci + sxy] - 6 * val[ci];
        curv[v] = Math.max(-1, Math.min(1, lap / h * 0.5));
      }
    }
    if (aoK > 0) {
      let occ = 0, w = 0.55;
      for (let s = 1; s <= 3; s++) {
        const dd = aoK * s;
        const fd = f.d(x + g[0] * dd, y + g[1] * dd, z + g[2] * dd);
        occ += Math.max(0, dd - fd) / dd * w;
        w *= 0.65;
      }
      ao[v] = Math.max(0, 1 - occ * 1.3);
    } else ao[v] = 1;
  }

  // 5. Quads across every crossed grid edge, split along the shorter diagonal.
  const idx: number[] = [];
  const cellAt = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= cnx || y >= cny || z >= cnz ? -1 : cellV[x + y * cnx + z * cnx * cny]);
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    const dx1 = pos[a * 3] - pos[c * 3], dy1 = pos[a * 3 + 1] - pos[c * 3 + 1], dz1 = pos[a * 3 + 2] - pos[c * 3 + 2];
    const dx2 = pos[b * 3] - pos[d * 3], dy2 = pos[b * 3 + 1] - pos[d * 3 + 1], dz2 = pos[b * 3 + 2] - pos[d * 3 + 2];
    if (dx1 * dx1 + dy1 * dy1 + dz1 * dz1 <= dx2 * dx2 + dy2 * dy2 + dz2 * dz2) idx.push(a, b, c, a, c, d);
    else idx.push(a, b, d, b, c, d);
  };
  for (let gz = 0; gz < cnz; gz++) for (let gy = 0; gy < cny; gy++) for (let gx = 0; gx < cnx; gx++) {
    if (cellV[gx + gy * cnx + gz * cnx * cny] < 0) continue;
    const g0 = gx + gy * nx + gz * sxy;
    const inside = val[g0] < 0;
    // Edge along +X from this cell's min corner: shared by cells (y-1..y, z-1..z).
    if ((val[g0 + 1] < 0) !== inside) {
      quad(cellAt(gx, gy - 1, gz - 1), cellAt(gx, gy, gz - 1), cellAt(gx, gy, gz), cellAt(gx, gy - 1, gz), !inside);
    }
    if ((val[g0 + nx] < 0) !== inside) {
      quad(cellAt(gx - 1, gy, gz - 1), cellAt(gx - 1, gy, gz), cellAt(gx, gy, gz), cellAt(gx, gy, gz - 1), !inside);
    }
    if ((val[g0 + sxy] < 0) !== inside) {
      quad(cellAt(gx - 1, gy - 1, gz), cellAt(gx, gy - 1, gz), cellAt(gx, gy, gz), cellAt(gx - 1, gy, gz), !inside);
    }
  }
  return { pos, nor, mat, ao, curv, idx: new Uint32Array(idx), count };
}

/** Mirror copy across z = 0 (left limbs from right ones), winding fixed. */
export function mirrorZ(m: SculptMesh): SculptMesh {
  const pos = m.pos.slice(), nor = m.nor.slice();
  for (let i = 2; i < pos.length; i += 3) { pos[i] = -pos[i]; nor[i] = -nor[i]; }
  const idx = m.idx.slice();
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  return { pos, nor, mat: m.mat, ao: m.ao, curv: m.curv, idx, count: m.count };
}

/**
 * Drops the triangles buried inside another field (more than `margin` deep
 * at all three corners), e.g. the scalp under a hairstyle, and compacts the
 * vertices that are left.
 */
export function cullInside(m: SculptMesh, cover: Sdf, margin: number): SculptMesh {
  const n = m.count;
  const hidden = new Uint8Array(n);
  for (let i = 0; i < n; i++) hidden[i] = cover.d(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]) < -margin ? 1 : 0;
  const keep = new Int32Array(n).fill(-1);
  const idx: number[] = [];
  let count = 0;
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t], b = m.idx[t + 1], c = m.idx[t + 2];
    if (hidden[a] && hidden[b] && hidden[c]) continue;
    for (const v of [a, b, c]) {
      if (keep[v] < 0) keep[v] = count++;
      idx.push(keep[v]);
    }
  }
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  const mat = new Uint8Array(count), ao = new Float32Array(count), curv = new Float32Array(count);
  for (let i = 0; i < n; i++) {
    const j = keep[i];
    if (j < 0) continue;
    pos[j * 3] = m.pos[i * 3]; pos[j * 3 + 1] = m.pos[i * 3 + 1]; pos[j * 3 + 2] = m.pos[i * 3 + 2];
    nor[j * 3] = m.nor[i * 3]; nor[j * 3 + 1] = m.nor[i * 3 + 1]; nor[j * 3 + 2] = m.nor[i * 3 + 2];
    mat[j] = m.mat[i]; ao[j] = m.ao[i]; curv[j] = m.curv[i];
  }
  return { pos, nor, mat, ao, curv, idx: Uint32Array.from(idx), count };
}
