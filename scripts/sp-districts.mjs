import fs from 'node:fs';
import path from 'node:path';
import proj4 from 'proj4';

const source = path.resolve('geo/sp-districts-source.geojson');
const districts = JSON.parse(fs.readFileSync(source, 'utf8')).features;
const sirgas23s = '+proj=utm +zone=23 +south +ellps=GRS80 +units=m +no_defs';

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(point, rings) {
  return inRing(point, rings[0]) && !rings.slice(1).some((ring) => inRing(point, ring));
}

export const districtNames = districts.map(({ properties }) => properties.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));

export function districtAt(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude > -22 || latitude < -25 || longitude > -45 || longitude < -48) return null;
  const point = proj4('EPSG:4326', sirgas23s, [longitude, latitude]);
  for (const district of districts) {
    const [minX, minY, maxX, maxY] = district.bbox;
    if (point[0] < minX || point[0] > maxX || point[1] < minY || point[1] > maxY) continue;
    const polygons = district.geometry.type === 'Polygon' ? [district.geometry.coordinates] : district.geometry.coordinates;
    if (polygons.some((polygon) => inPolygon(point, polygon))) return district.properties.nome;
  }
  return null;
}
