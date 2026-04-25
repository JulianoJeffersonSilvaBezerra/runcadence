import { RouteMap } from './RouteMap';
import type { RoutePoint } from '../hooks/useGPS';

interface GPSMapProps {
  routePoints: RoutePoint[];
  currentLat: number;
  currentLng: number;
  isActive: boolean;
}

export function GPSMap({ routePoints, currentLat, currentLng, isActive }: GPSMapProps) {
  return (
    <div className="treino-map-canvas-wrap">
      {isActive || routePoints.length > 0 ? (
        <RouteMap
          routePoints={routePoints}
          currentLat={currentLat}
          currentLng={currentLng}
          isActive={isActive}
        />
      ) : (
        <div className="map-placeholder">
          <span>Inicie a corrida para ver o trajeto</span>
        </div>
      )}
    </div>
  );
}
