// The hint arrow as a solid: a flat prism built from arrow.js's outline, toon
// shaded like the cards, with the kit's ink line round it, and casting a shadow.
// The outline changes every frame, so the buffers are filled in place.

import { BufferAttribute, BufferGeometry, Mesh, MeshToonMaterial, ShapeUtils, Vector2 } from "three";
import { INK, RAMPS, inkMaterial } from "../../kit/js/materials.js";

const MAX_POINTS = 40; // an outline never has more (arrow.js: 2 * (steps + 1) + 3)

// -> { mesh, set(outline, y, height) , hide() }. `color` is the arrow's blue.
export function createArrowMesh(stage, color) {
  const verts = MAX_POINTS * 4; // top cap, bottom cap, and two rings for the walls
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(verts * 3), 3);
  const normal = new BufferAttribute(new Float32Array(verts * 3), 3);
  const outlineNormal = new BufferAttribute(new Float32Array(verts * 3), 3);
  geometry.setAttribute("position", position);
  geometry.setAttribute("normal", normal);
  geometry.setAttribute("outlineNormal", outlineNormal);
  const index = new BufferAttribute(new Uint16Array(MAX_POINTS * 3 * 2 * 3), 1);
  geometry.setIndex(index);
  geometry.setDrawRange(0, 0);

  const mesh = new Mesh(geometry, new MeshToonMaterial({ color, gradientMap: RAMPS.card() }));
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.raycast = () => {};
  const ink = new Mesh(geometry, inkMaterial({ color: INK, width: 2.5 }));
  stage.registerInk(ink.material);
  ink.raycast = () => {};
  ink.frustumCulled = false;
  mesh.add(ink);
  stage.scene.add(mesh);

  function set(outline, y, height) {
    const n = Math.min(outline.length, MAX_POINTS);
    let area = 0;
    for (let i = 0; i < n; i++) {
      const [ax, az] = outline[i];
      const [bx, bz] = outline[(i + 1) % n];
      area += ax * bz - bx * az;
    }
    const sgn = area >= 0 ? 1 : -1;
    // The outward horizontal direction at each point: its two edges' normals, averaged.
    const out = [];
    for (let i = 0; i < n; i++) {
      const [px, pz] = outline[(i + n - 1) % n];
      const [qx, qz] = outline[(i + 1) % n];
      const [cx, cz] = outline[i];
      const e = (ax, az, bx, bz) => {
        const l = Math.hypot(bx - ax, bz - az) || 1;
        return [(sgn * (bz - az)) / l, (-sgn * (bx - ax)) / l];
      };
      const a = e(px, pz, cx, cz);
      const b = e(cx, cz, qx, qz);
      const m = [a[0] + b[0], a[1] + b[1]];
      const l = Math.hypot(m[0], m[1]) || 1;
      out.push([m[0] / l, m[1] / l]);
    }
    const top = y + height;
    // Vertices: [0, n) top cap, [n, 2n) bottom cap, [2n, 3n) wall top, [3n, 4n) wall bottom.
    for (let i = 0; i < n; i++) {
      const [x, z] = outline[i];
      const [ox, oz] = out[i];
      const put = (k, py, nx, ny, nz) => {
        position.setXYZ(k, x, py, z);
        normal.setXYZ(k, nx, ny, nz);
        outlineNormal.setXYZ(k, ox, 0, oz);
      };
      put(i, top, 0, 1, 0);
      put(n + i, y, 0, -1, 0);
      put(2 * n + i, top, ox, 0, oz);
      put(3 * n + i, y, ox, 0, oz);
    }
    // Triangles, each turned to face the way `want` points.
    let k = 0;
    const tri = (a, b, c, wx, wy, wz) => {
      const u = [position.getX(b) - position.getX(a), position.getY(b) - position.getY(a), position.getZ(b) - position.getZ(a)];
      const v = [position.getX(c) - position.getX(a), position.getY(c) - position.getY(a), position.getZ(c) - position.getZ(a)];
      const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (cr[0] * wx + cr[1] * wy + cr[2] * wz >= 0) index.setX(k++, a), index.setX(k++, b), index.setX(k++, c);
      else index.setX(k++, a), index.setX(k++, c), index.setX(k++, b);
    };
    const cap = ShapeUtils.triangulateShape(outline.slice(0, n).map(([x, z]) => new Vector2(x, z)), []);
    for (const [a, b, c] of cap) {
      tri(a, b, c, 0, 1, 0);
      tri(n + a, n + b, n + c, 0, -1, 0);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const wx = out[i][0] + out[j][0];
      const wz = out[i][1] + out[j][1];
      tri(2 * n + i, 3 * n + i, 2 * n + j, wx, 0, wz);
      tri(2 * n + j, 3 * n + i, 3 * n + j, wx, 0, wz);
    }
    for (const a of [position, normal, outlineNormal, index]) a.needsUpdate = true;
    geometry.setDrawRange(0, k);
    mesh.visible = true;
  }

  return { mesh, set, hide: () => { mesh.visible = false; } };
}
