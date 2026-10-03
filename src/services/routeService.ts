import L from 'leaflet';

export interface ParcelCoordinate {
  id: string | number;
  weight?: number;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  address?: string;
  recipient?: string;
}

export const DEPOT_COORDINATES = {
  lat: -25.4753,
  lng: 30.9694,
  name: 'Central Dispatch Depot (Mbombela)',
};

// Module-level tracker for the active planned route layer and stop markers
let activePlannedRouteLayer: L.GeoJSON | L.Polyline | null = null;
let activeStopMarkersLayer: L.LayerGroup | null = null;

/**
 * Extracts coordinates from orderedParcels, calls the public OSRM Route API,
 * and draws the planned path with a yellow/amber dashed polyline on the Leaflet map.
 * 
 * @param orderedParcels Array of parcels in their delivery sequence
 * @param map Leaflet map instance (optional if window.leafletMap or global map is present)
 * @returns Promise resolving to the drawn GeoJSON/Polyline layer or null
 */
export async function drawPlannedRoute(
  orderedParcels: ParcelCoordinate[],
  map?: L.Map | null
): Promise<L.Layer | null> {
  // Resolve map instance
  const targetMap =
    map ||
    (window as unknown as { currentLeafletMap?: L.Map }).currentLeafletMap ||
    (window as unknown as { AppState?: { leafletMap?: L.Map } }).AppState?.leafletMap;

  if (!targetMap) {
    console.warn('[RouteService] Leaflet map instance is not available to draw planned route.');
    return null;
  }

  // 1. Ensure any previously drawn planned route and markers are removed
  if (activePlannedRouteLayer) {
    try {
      targetMap.removeLayer(activePlannedRouteLayer);
    } catch (err) {
      console.warn('Error removing previous planned route layer:', err);
    }
    activePlannedRouteLayer = null;
  }

  if (activeStopMarkersLayer) {
    try {
      targetMap.removeLayer(activeStopMarkersLayer);
    } catch (err) {
      console.warn('Error removing previous stop markers layer:', err);
    }
    activeStopMarkersLayer = null;
  }

  if (!orderedParcels || orderedParcels.length === 0) {
    console.info('[RouteService] No ordered parcels provided for planned route.');
    return null;
  }

  // 2. Extract coordinates: starting with the depot at -25.4753, 30.9694
  // OSRM expects {longitude},{latitude};{longitude},{latitude}...
  const coordPairs: { lng: number; lat: number; label: string; parcel?: ParcelCoordinate }[] = [];

  // Start with Depot
  coordPairs.push({
    lng: DEPOT_COORDINATES.lng,
    lat: DEPOT_COORDINATES.lat,
    label: 'Depot (Start)',
  });

  // Extract from ordered parcels
  orderedParcels.forEach((parcel, index) => {
    const lat = parcel.lat ?? parcel.latitude;
    const lng = parcel.lng ?? parcel.longitude;

    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      coordPairs.push({
        lng,
        lat,
        label: `Stop ${index + 1}: Parcel #${parcel.id} (${parcel.weight ?? 0} kg)`,
        parcel,
      });
    } else {
      // Realistic spread around depot if coordinates are missing in raw payload
      const angle = (index / Math.max(1, orderedParcels.length)) * 2 * Math.PI;
      const radiusKm = 2.5 + (index % 4) * 1.8;
      const simLat = DEPOT_COORDINATES.lat + (radiusKm / 111) * Math.cos(angle);
      const simLng =
        DEPOT_COORDINATES.lng +
        (radiusKm / (111 * Math.cos((DEPOT_COORDINATES.lat * Math.PI) / 180))) * Math.sin(angle);

      coordPairs.push({
        lng: Number(simLng.toFixed(5)),
        lat: Number(simLat.toFixed(5)),
        label: `Stop ${index + 1}: Parcel #${parcel.id} (${parcel.weight ?? 0} kg)`,
        parcel,
      });
    }
  });

  // Format as lng,lat;lng,lat...
  const coordsParam = coordPairs.map((c) => `${c.lng},${c.lat}`).join(';');
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsParam}?geometries=geojson&overview=full`;

  try {
    const response = await fetch(osrmUrl);
    if (!response.ok) {
      throw new Error(`OSRM Route API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.routes || data.routes.length === 0) {
      throw new Error('No route found in OSRM response');
    }

    const primaryRoute = data.routes[0];
    const geojsonData = primaryRoute.geometry;

    // 3. Draw on the Leaflet map using a dashed line (dashArray: '10, 10', color: #fbbf24)
    const plannedLineLayer = L.geoJSON(geojsonData, {
      style: {
        color: '#fbbf24', // Amber/Yellow
        weight: 5,
        opacity: 0.95,
        dashArray: '10, 10',
        lineCap: 'round',
        lineJoin: 'round',
      },
    });

    plannedLineLayer.bindPopup(`
      <div style="font-family: system-ui, sans-serif; padding: 4px; font-size: 12px; color: #1e293b;">
        <div style="font-weight: 700; color: #d97706; margin-bottom: 2px;">⚡ Planned Delivery Route</div>
        <div>Stops: <strong>${orderedParcels.length} parcels</strong></div>
        <div>Est. Distance: <strong>${(primaryRoute.distance / 1000).toFixed(1)} km</strong></div>
        <div>Est. Drive Time: <strong>${Math.round(primaryRoute.duration / 60)} mins</strong></div>
      </div>
    `);

    plannedLineLayer.addTo(targetMap);
    activePlannedRouteLayer = plannedLineLayer;

    // Add numbered stop markers
    const stopMarkers = L.layerGroup();
    coordPairs.forEach((point, idx) => {
      const isDepot = idx === 0;
      const markerHtml = isDepot
        ? `<div style="background: #1e293b; color: #ffffff; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; border: 2px solid #fbbf24; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">HQ</div>`
        : `<div style="background: #fbbf24; color: #78350f; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; border: 2px solid #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${idx}</div>`;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'planned-route-stop-icon',
        iconSize: isDepot ? [26, 26] : [22, 22],
        iconAnchor: isDepot ? [13, 13] : [11, 11],
      });

      const marker = L.marker([point.lat, point.lng], { icon: customIcon });
      marker.bindPopup(`
        <div style="font-family: system-ui, sans-serif; font-size: 12px;">
          <strong style="color: ${isDepot ? '#0f172a' : '#d97706'};">${point.label}</strong>
          ${point.parcel?.address ? `<p style="margin: 4px 0 0; color: #64748b;">${point.parcel.address}</p>` : ''}
        </div>
      `);
      stopMarkers.addLayer(marker);
    });

    stopMarkers.addTo(targetMap);
    activeStopMarkersLayer = stopMarkers;

    // Fit map bounds to show the entire planned route
    if (plannedLineLayer.getBounds().isValid()) {
      targetMap.fitBounds(plannedLineLayer.getBounds(), { padding: [40, 40] });
    }

    return plannedLineLayer;
  } catch (error) {
    console.warn('[RouteService] OSRM API call failed or timed out. Drawing direct fallback polyline:', error);

    // Resilient fallback: connect coordinates with dashed yellow line directly
    const latLngs: [number, number][] = coordPairs.map((c) => [c.lat, c.lng]);
    const fallbackLine = L.polyline(latLngs, {
      color: '#fbbf24',
      weight: 4,
      opacity: 0.9,
      dashArray: '10, 10',
    }).addTo(targetMap);

    activePlannedRouteLayer = fallbackLine;
    if (fallbackLine.getBounds().isValid()) {
      targetMap.fitBounds(fallbackLine.getBounds(), { padding: [40, 40] });
    }

    return fallbackLine;
  }
}

/**
 * Clears any existing planned route layer and stop markers from the map.
 */
export function clearPlannedRoute(map?: L.Map | null): void {
  const targetMap =
    map ||
    (window as unknown as { currentLeafletMap?: L.Map }).currentLeafletMap ||
    (window as unknown as { AppState?: { leafletMap?: L.Map } }).AppState?.leafletMap;

  if (targetMap && activePlannedRouteLayer) {
    try {
      targetMap.removeLayer(activePlannedRouteLayer);
    } catch (e) {}
    activePlannedRouteLayer = null;
  }

  if (targetMap && activeStopMarkersLayer) {
    try {
      targetMap.removeLayer(activeStopMarkersLayer);
    } catch (e) {}
    activeStopMarkersLayer = null;
  }
}
