// Web-mercator maths + "fit these pins into the frame" for the in-app map.
// Kept free of React / pigeon-maps so it can be tested on its own.

export const TILE = 256;
export const MIN_ZOOM = 0; // whole world visible in one 256px tile
export const MAX_ZOOM = 19; // deepest zoom OpenStreetMap serves

export function project([lat, lng]) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const x = lng / 360 + 0.5;
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  return [x, y];
}

export function unproject([x, y]) {
  const lng = (x - 0.5) * 360;
  const n = Math.PI - 2 * Math.PI * y;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return [lat, lng];
}

// where a coordinate lands on screen for a given view (center + zoom)
export function toScreen(point, center, zoom, width, height) {
  const world = TILE * 2 ** zoom;
  const [px, py] = project(point);
  const [cx, cy] = project(center);
  return [width / 2 + (px - cx) * world, height / 2 + (py - cy) * world];
}

export const clampZoom = (z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

// Choose a center + zoom that puts EVERY point inside the frame.
//
// Pins are tall: the point is the tip at the bottom, and the pin body (plus
// its label) sits ABOVE it. So the top margin has to be bigger than the
// bottom one, or the northern-most pins get cut off by the top edge.
//
//   padTop    room above the highest point (pin height + a little air)
//   padBottom room below the lowest point (label height)
//   padX      room either side
//   maxZoom   never zoom in closer than this when fitting several pins
//   singleZoom  zoom used when there is only one pin to show
export function fitPoints(points, width, height, opts = {}) {
  const { maxZoom = 15, minZoom = MIN_ZOOM, padX = 40, padTop = 60, padBottom = 30, singleZoom = 12 } = opts;
  if (!points || !points.length || !width || !height) return null;
  if (points.length === 1) return { center: points[0], zoom: Math.min(singleZoom, maxZoom) };

  const proj = points.map(project);
  const xs = proj.map((p) => p[0]);
  const ys = proj.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const availW = Math.max(1, width - padX * 2);
  const availH = Math.max(1, height - padTop - padBottom);
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const raw = Math.min(Math.log2(availW / (TILE * spanX)), Math.log2(availH / (TILE * spanY)));
  const zoom = Math.max(minZoom, Math.min(maxZoom, raw));

  // centre the box inside the (asymmetrically padded) usable area
  const world = TILE * 2 ** zoom;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2 - (padTop - padBottom) / (2 * world);
  return { center: unproject([cx, Math.min(0.999, Math.max(0.001, cy))]), zoom };
}
