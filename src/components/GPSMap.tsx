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
    <section className="map-card">
      <div className="section-head" style={{ padding: '18px 16px 0' }}>
        <h2>Mapa do trajeto</h2>
        <span className="mini-badge">{routePoints.length} pts</span>
      </div>

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
    </section>
  );
}
