'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Map, { Marker, Popup, useMap } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { VenueListItem } from '../../models/venue.model';
import { VenueMarkerPopup } from './VenueMarkerPopup';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

function createPinElement(color: string, glowColor: string, size: number) {
  return (
    <div style={{ position: 'relative', width: size, height: size + 12 }}>
      <div
        style={{
          width: size,
          height: size,
          background: color,
          borderRadius: '50% 50% 50% 0',
          transform: 'rotate(-45deg)',
          border: '2.5px solid white',
          boxShadow: `0 3px 10px ${glowColor}`,
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: size * 0.22,
          left: size * 0.22,
          width: size * 0.56,
          height: size * 0.56,
          background: 'rgba(255,255,255,0.35)',
          borderRadius: '50%',
        }}
      />
    </div>
  );
}

const defaultPin = createPinElement(
  'linear-gradient(135deg,#6366F1,#4F46E5)',
  'rgba(99,102,241,0.35)',
  28,
);

const gpuPin = createPinElement(
  'linear-gradient(135deg,#F59E0B,#D97706)',
  'rgba(245,158,11,0.35)',
  28,
);

const highlightPin = createPinElement(
  'linear-gradient(135deg,#6366F1,#818CF8)',
  'rgba(99,102,241,0.5)',
  34,
);

function getPin(venue: VenueListItem, isHovered: boolean) {
  if (isHovered) return highlightPin;
  if (venue.amenities?.includes('GPU')) return gpuPin;
  return defaultPin;
}

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const prevCenterRef = useRef(center);
  const prevZoomRef = useRef(zoom);

  useEffect(() => {
    const [lat, lng] = center;
    if (
      prevCenterRef.current[0] !== lat ||
      prevCenterRef.current[1] !== lng ||
      prevZoomRef.current !== zoom
    ) {
      map.current?.flyTo({
        center: [lng, lat],
        zoom,
        duration: 800,
        essential: true,
      });
      prevCenterRef.current = center;
      prevZoomRef.current = zoom;
    }
  }, [map, center, zoom]);

  return null;
}

interface VenueMapProps {
  venues: VenueListItem[];
  center: [number, number];
  zoom: number;
  selectedVenueId: string | null;
  hoveredVenueId: string | null;
  onSelectVenue: (venueId: string | null) => void;
}

export default function VenueMap({
  venues,
  center,
  zoom,
  selectedVenueId,
  hoveredVenueId,
  onSelectVenue,
}: VenueMapProps) {
  const [popupVenue, setPopupVenue] = useState<VenueListItem | null>(null);

  const handleMarkerClick = useCallback((venue: VenueListItem) => {
    onSelectVenue(venue.venueId);
    setPopupVenue(venue);
  }, [onSelectVenue]);

  const handlePopupClose = useCallback(() => {
    setPopupVenue(null);
    onSelectVenue(null);
  }, [onSelectVenue]);

  return (
    <Map
      initialViewState={{
        longitude: center[1],
        latitude: center[0],
        zoom,
      }}
      mapStyle={MAP_STYLE}
      style={{ width: '100%', height: '100%' }}
      attributionControl={false}
    >
      <MapUpdater center={center} zoom={zoom} />
      {venues.map((venue) => (
        <Marker
          key={venue.venueId}
          longitude={venue.longitude}
          latitude={venue.latitude}
          anchor="bottom"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            handleMarkerClick(venue);
          }}
        >
          {getPin(venue, venue.venueId === hoveredVenueId)}
        </Marker>
      ))}
      {popupVenue && (
        <Popup
          longitude={popupVenue.longitude}
          latitude={popupVenue.latitude}
          anchor="bottom"
          offset={[0, -45]}
          onClose={handlePopupClose}
          closeButton={true}
          closeOnClick={false}
          className="venue-popup"
        >
          <VenueMarkerPopup venue={popupVenue} />
        </Popup>
      )}
    </Map>
  );
}
