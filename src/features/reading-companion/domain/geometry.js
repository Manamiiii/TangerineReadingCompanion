// GeoJSON shapes have fixed nesting depth. Bound both container and point counts.
export function isValidGeoJsonGeometry(geometry) {
  let budget = 20000
  let points = 0
  const array = (value, minimum, check) => Array.isArray(value)
    && value.length >= minimum && value.length <= budget
    && (budget -= value.length) >= 0 && value.every(check)
  const position = value => ++points <= 10000 && Array.isArray(value)
    && (value.length === 2 || value.length === 3)
    && value.every(item => typeof item === 'number' && Number.isFinite(item))
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90
  const line = value => array(value, 2, position)
  const ring = value => array(value, 4, position)
    && value[0].length === value.at(-1).length
    && value[0].every((coordinate, index) => coordinate === value.at(-1)[index])
  const polygon = value => array(value, 1, ring)
  switch (geometry?.type) {
    case 'Point': return position(geometry.coordinates)
    case 'LineString': return line(geometry.coordinates)
    case 'MultiLineString': return array(geometry.coordinates, 1, line)
    case 'Polygon': return polygon(geometry.coordinates)
    case 'MultiPolygon': return array(geometry.coordinates, 1, polygon)
    default: return false
  }
}
