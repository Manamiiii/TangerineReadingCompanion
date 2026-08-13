import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import {
  READING_MAP_DEFAULT_VIEW,
  readingMapTileSources,
} from '../map/mapConfig.js'

const PLACE_COLORS = {
  real: '#2563eb',
  prototype: '#7c3aed',
  approximate: '#d97706',
  fictional: '#64748b',
}

function markerStyle(place, active = false) {
  const color = PLACE_COLORS[place.placeKind] || PLACE_COLORS.real
  return {
    color: active ? '#111827' : '#ffffff',
    fillColor: color,
    fillOpacity: 0.92,
    opacity: 1,
    weight: active ? 3 : 2,
    radius: active ? 10 : 8,
  }
}

function geometryStyle(place, active = false) {
  const color = PLACE_COLORS[place.placeKind] || PLACE_COLORS.real
  return {
    color: active ? '#111827' : color,
    fillColor: color,
    fillOpacity: 0.18,
    opacity: 0.92,
    weight: active ? 6 : 4,
  }
}

function layerStyle(place, active = false) {
  const geoJsonType = place.geometry?.geojson?.type
  return place.geometry?.type === 'geojson' && geoJsonType !== 'Point'
    ? geometryStyle(place, active)
    : markerStyle(place, active)
}

export function ReadingGeoMap({
  places,
  selectedPlaceId,
  onSelectPlace,
  providerId,
  tiandituToken,
  isActive = true,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const tileLayersRef = useRef([])
  const markerLayerRef = useRef(null)
  const markersRef = useRef(new Map())
  const onSelectPlaceRef = useRef(onSelectPlace)
  const [tileState, setTileState] = useState('loading')
  const [tileUsage, setTileUsage] = useState({ base: 0, labels: 0 })
  const spatialPlaces = useMemo(
    () => places.filter((place) => (
      Number.isFinite(place.geometry?.latitude)
      && Number.isFinite(place.geometry?.longitude)
    )),
    [places],
  )

  useEffect(() => {
    onSelectPlaceRef.current = onSelectPlace
  }, [onSelectPlace])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined

    const map = L.map(containerRef.current, {
      attributionControl: true,
      minZoom: 2,
      zoomControl: true,
    }).setView(READING_MAP_DEFAULT_VIEW.center, READING_MAP_DEFAULT_VIEW.zoom)
    const markerLayer = L.featureGroup().addTo(map)

    mapRef.current = map
    markerLayerRef.current = markerLayer

    const resizeFrame = requestAnimationFrame(() => map.invalidateSize())

    return () => {
      cancelAnimationFrame(resizeFrame)
      markersRef.current.clear()
      tileLayersRef.current = []
      markerLayerRef.current = null
      mapRef.current = null
      map.remove()
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize({ animate: false })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isActive || !mapRef.current) return undefined
    const resizeFrame = requestAnimationFrame(() => {
      mapRef.current?.invalidateSize({ animate: false })
    })
    return () => cancelAnimationFrame(resizeFrame)
  }, [isActive])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined

    for (const layer of tileLayersRef.current) layer.remove()
    tileLayersRef.current = []
    const sources = readingMapTileSources(providerId, tiandituToken)
    if (sources.length === 0) {
      setTileState('missing-key')
      return undefined
    }

    setTileState('loading')
    setTileUsage({ base: 0, labels: 0 })
    let loadedLayerCount = 0
    let hasTileError = false
    const layers = sources.map((source) => {
      const layer = L.tileLayer(source.url, source.options)
      layer.on('load', () => {
        loadedLayerCount += 1
        if (loadedLayerCount === sources.length && !hasTileError) setTileState('ready')
      })
      layer.on('tileerror', () => {
        hasTileError = true
        setTileState('error')
      })
      layer.on('tileloadstart', () => {
        setTileUsage((current) => ({
          ...current,
          [source.usageKind]: current[source.usageKind] + 1,
        }))
      })
      return layer.addTo(map)
    })
    tileLayersRef.current = layers

    return () => {
      for (const layer of layers) layer.remove()
      if (tileLayersRef.current === layers) tileLayersRef.current = []
    }
  }, [providerId, tiandituToken])

  useEffect(() => {
    const map = mapRef.current
    const markerLayer = markerLayerRef.current
    if (!map || !markerLayer) return

    markerLayer.clearLayers()
    markersRef.current.clear()
    map.invalidateSize({ animate: false })

    for (const place of spatialPlaces) {
      const {
        latitude,
        longitude,
        type,
        radiusKm,
        geojson,
      } = place.geometry
      let marker
      if (type === 'geojson' && geojson) {
        marker = L.geoJSON(geojson, {
          style: () => layerStyle(place),
          pointToLayer: (_feature, latlng) => L.circleMarker(latlng, markerStyle(place)),
        })
      } else if (type === 'area') {
        marker = L.circle([latitude, longitude], {
          ...markerStyle(place),
          radius: radiusKm * 1000,
        })
      } else {
        marker = L.circleMarker([latitude, longitude], markerStyle(place))
      }
      marker
        .bindTooltip(place.name, {
          className: 'reader-map-tooltip',
          direction: 'top',
          offset: [0, -8],
          permanent: true,
        })
        .on('click', () => onSelectPlaceRef.current(place.id))
        .addTo(markerLayer)
      markersRef.current.set(place.id, marker)
    }

    if (!isActive) return
    if (spatialPlaces.length === 0) {
      map.setView(READING_MAP_DEFAULT_VIEW.center, READING_MAP_DEFAULT_VIEW.zoom)
    } else if (spatialPlaces.length === 1 && spatialPlaces[0].geometry.type === 'point') {
      const [place] = spatialPlaces
      map.setView([place.geometry.latitude, place.geometry.longitude], 10)
    } else {
      const bounds = markerLayer.getBounds()
      if (bounds.isValid()) map.fitBounds(bounds, { maxZoom: 10, padding: [36, 36] })
    }
  }, [isActive, spatialPlaces])

  useEffect(() => {
    if (!isActive || !selectedPlaceId) return
    for (const place of spatialPlaces) {
      const marker = markersRef.current.get(place.id)
      if (!marker) continue
      marker.setStyle(layerStyle(place, place.id === selectedPlaceId))
      if (place.id === selectedPlaceId && typeof marker.bringToFront === 'function') {
        marker.bringToFront()
      }
    }
    const selectedPlace = spatialPlaces.find((place) => place.id === selectedPlaceId)
    if (selectedPlace && mapRef.current) {
      const marker = markersRef.current.get(selectedPlace.id)
      const bounds = typeof marker?.getBounds === 'function' ? marker.getBounds() : null
      mapRef.current.panTo(
        bounds?.isValid()
          ? bounds.getCenter()
          : [selectedPlace.geometry.latitude, selectedPlace.geometry.longitude],
      )
    }
  }, [isActive, selectedPlaceId, spatialPlaces])

  return (
    <div className="reader-interactive-map">
      <div
        className="reader-leaflet-map"
        ref={containerRef}
        aria-label="已读地点互动地图"
      />
      {tileState === 'loading' && (
        <span className="reader-map-network-state">正在加载地图底图…</span>
      )}
      {tileState === 'error' && (
        <span className="reader-map-network-state error">
          底图暂时不可用；可切换网络，地点标记仍按经纬度显示。
        </span>
      )}
      {tileState === 'missing-key' && (
        <span className="reader-map-network-state error">
          请填写天地图浏览器端 Key。
        </span>
      )}
      {tileUsage.base + tileUsage.labels > 0 && (
        <span
          className="reader-map-tile-usage"
          title="本地瓦片加载计数，用于估算；浏览器缓存可能使服务商实际计量更少"
        >
          本次加载：底图 {tileUsage.base}
          {tileUsage.labels > 0 && ` · 注记 ${tileUsage.labels}`} 块
        </span>
      )}
      <div className="reader-map-legend" aria-label="地点类型图例">
        <span><i className="real" />真实地点</span>
        <span><i className="prototype" />原型地点</span>
        <span><i className="approximate" />模糊区域</span>
        <span><i className="fictional" />虚构参考区域</span>
      </div>
    </div>
  )
}
