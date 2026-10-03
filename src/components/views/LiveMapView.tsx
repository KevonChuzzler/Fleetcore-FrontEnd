import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { drawPlannedRoute, clearPlannedRoute, ParcelCoordinate, DEPOT_COORDINATES } from '../../services/routeService';

export interface LiveMapViewProps {
  onRouteDrawn?: (layer: L.Layer | null) => void;
  selectedParcels?: ParcelCoordinate[];
}

export { drawPlannedRoute, clearPlannedRoute };

export default function LiveMapView({ onRouteDrawn, selectedParcels }: LiveMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [hasPlannedRoute, setHasPlannedRoute] = useState(false);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      attributionControl: false,
    }).setView([DEPOT_COORDINATES.lat, DEPOT_COORDINATES.lng], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Add Central Depot Marker
    const depotIcon = L.divIcon({
      html: `
        <div style="background: #0f172a; color: #fbbf24; border: 2px solid #fbbf24; width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.35);">
          <svg style="width: 18px; height: 18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
      `,
      className: 'depot-marker-icon',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    const depotMarker = L.marker([DEPOT_COORDINATES.lat, DEPOT_COORDINATES.lng], { icon: depotIcon }).addTo(map);
    depotMarker.bindPopup(`
      <div style="font-family: system-ui, sans-serif; font-size: 12px; padding: 2px;">
        <strong style="color: #0f172a; font-size: 13px;">${DEPOT_COORDINATES.name}</strong>
        <p style="margin: 4px 0 0; color: #64748b;">Central Fleet & Logistics Hub</p>
        <span style="font-size: 11px; font-family: monospace; color: #94a3b8;">${DEPOT_COORDINATES.lat}, ${DEPOT_COORDINATES.lng}</span>
      </div>
    `);

    mapInstanceRef.current = map;
    (window as unknown as { currentLeafletMap: L.Map }).currentLeafletMap = map;

    // Handle container resize
    setTimeout(() => {
      map.invalidateSize();
      setIsMapReady(true);
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // When selectedParcels change from parent props, trigger route drawing
  useEffect(() => {
    if (isMapReady && selectedParcels && selectedParcels.length > 0) {
      handleDrawRoute(selectedParcels);
    }
  }, [selectedParcels, isMapReady]);

  const handleDrawRoute = async (parcels: ParcelCoordinate[]) => {
    if (!mapInstanceRef.current) return;
    const layer = await drawPlannedRoute(parcels, mapInstanceRef.current);
    setHasPlannedRoute(!!layer);
    if (onRouteDrawn) onRouteDrawn(layer);
  };

  const handleClear = () => {
    if (!mapInstanceRef.current) return;
    clearPlannedRoute(mapInstanceRef.current);
    setHasPlannedRoute(false);
  };

  const runSampleDemoRoute = () => {
    const demoParcels: ParcelCoordinate[] = [
      { id: 'P-101', weight: 42.5, lat: -25.4612, lng: 30.9821, address: 'Nelspruit Mall Logistics Gate' },
      { id: 'P-104', weight: 18.2, lat: -25.4429, lng: 30.9554, address: 'Riverside Industrial Park' },
      { id: 'P-107', weight: 64.0, lat: -25.4851, lng: 31.0012, address: 'Matumi Distribution Center' },
      { id: 'P-112', weight: 31.0, lat: -25.5019, lng: 30.9418, address: 'West Acres Freight Hub' },
    ];
    handleDrawRoute(demoParcels);
  };

  return (
    <div className="relative w-full h-full min-h-[400px] flex flex-col bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
      {/* Map Header Overlay */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">OSRM Planned Routing Engine</span>
        <span className="text-[10px] text-slate-500 font-mono">Leaflet v1.9</span>
      </div>

      {/* Legend & Controls Overlay */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md text-xs">
        <div className="flex items-center gap-1.5 px-2 text-slate-600 dark:text-slate-300">
          <span className="w-4 h-0.5 border-b-2 border-dashed border-amber-400"></span>
          <span className="text-[11px] font-medium">Planned Route (#fbbf24)</span>
        </div>

        {hasPlannedRoute && (
          <button
            onClick={handleClear}
            className="px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
          >
            Clear Route
          </button>
        )}

        <button
          onClick={runSampleDemoRoute}
          className="px-2.5 py-1 text-[11px] font-medium text-amber-900 bg-amber-400 hover:bg-amber-300 rounded transition-colors shadow-2xs font-mono"
        >
          Test OSRM Path
        </button>
      </div>

      {/* Main Leaflet Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full flex-1 z-0" style={{ minHeight: '420px' }} />
    </div>
  );
}
