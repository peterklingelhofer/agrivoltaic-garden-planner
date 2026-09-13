import type { LatLon } from '../types/geo'

export const IMAGERY_ATTRIBUTION = 'Esri, Maxar, Earthstar Geographics'

export const TILE_ZOOM = 18

export const tileXY = (
  location: LatLon,
  zoom: number = TILE_ZOOM,
): { readonly x: number; readonly y: number; readonly z: number } => {
  const lat = (location.latitudeDeg * Math.PI) / 180
  const n = 2 ** zoom
  return {
    x: Math.floor(((location.longitudeDeg + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n),
    z: zoom,
  }
}

export const imageryUrl = (location: LatLon, zoom: number = TILE_ZOOM): string => {
  const { x, y, z } = tileXY(location, zoom)
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
}
