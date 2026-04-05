// src/components/RouteMap.tsx
// Crie a pasta src/components/ se ela não existir.
// Import CORRETO: vem de '../hooks/useGPS' (não de useRunningPlugin)

import { useEffect, useRef } from 'react';
import type { RoutePoint } from '../hooks/useGPS';

declare const L: any;

interface RouteMapProps {
  routePoints: RoutePoint[];
  currentLat:  number;
  currentLng:  number;
  isActive:    boolean;
}

export function RouteMap({ routePoints, currentLat, currentLng, isActive }: RouteMapProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<any>(null);
  const polylineRef   = useRef<any>(null);
  const markerRef     = useRef<any>(null);
  const startMarkerRef = useRef<any>(null);
  const endMarkerRef = useRef<any>(null);
  const loadedRef     = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;

    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script    = document.createElement('script');
    script.src      = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async    = true;
    script.onload   = () => { loadedRef.current = true; initMap(); };
    document.head.appendChild(script);
  }, []);

  function initMap() {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([-8.9, -40.5], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    polylineRef.current = L.polyline([], {
      color: '#00e676', weight: 5, opacity: 0.9,
      lineCap: 'round', lineJoin: 'round',
    }).addTo(map);

    const icon = L.divIcon({
      className: '',
      html: `<div style="width:16px;height:16px;border-radius:50%;background:#00e676;border:3px solid #fff;box-shadow:0 0 0 4px rgba(0,230,118,.3)"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    markerRef.current = L.marker([0, 0], { icon }).addTo(map);

    const startIcon = L.divIcon({
      className: '',
      html: `<div style="width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:#00c853;color:#fff;font-size:11px;font-weight:700;border:2px solid #fff">S</div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    const endIcon = L.divIcon({
      className: '',
      html: `<div style="width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:#ff5252;color:#fff;font-size:11px;font-weight:700;border:2px solid #fff">F</div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    startMarkerRef.current = L.marker([0, 0], { icon: startIcon }).addTo(map);
    endMarkerRef.current = L.marker([0, 0], { icon: endIcon }).addTo(map);
    mapRef.current    = map;
  }

  useEffect(() => {
    if (!mapRef.current || routePoints.length === 0) return;

    polylineRef.current?.setLatLngs(routePoints.map((p) => [p.lat, p.lng]));

    if (currentLat !== 0 && currentLng !== 0) {
      markerRef.current?.setLatLng([currentLat, currentLng]);
      if (isActive) {
        mapRef.current.setView([currentLat, currentLng], 17, { animate: true, duration: 0.5 });
      }
    }

    const start = routePoints[0];
    const end = routePoints[routePoints.length - 1];
    startMarkerRef.current?.setLatLng([start.lat, start.lng]);
    endMarkerRef.current?.setLatLng([end.lat, end.lng]);

    if (routePoints.length === 1) {
      mapRef.current.setView([routePoints[0].lat, routePoints[0].lng], 17);
    }

    if (!isActive && routePoints.length > 1) {
      const bounds = L.latLngBounds(routePoints.map((p) => [p.lat, p.lng]));
      mapRef.current.fitBounds(bounds, { padding: [24, 24] });
    }
  }, [routePoints, currentLat, currentLng, isActive]);

  useEffect(() => {
    if (loadedRef.current && !mapRef.current) initMap();
  });

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '220px', background: '#0d1118' }}
    />
  );
}
