import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonFab, IonFabButton, IonIcon, IonPopover, IonList, IonItem, IonSearchbar, IonModal, IonInput, IonButton, IonLabel, IonText, IonToast } from '@ionic/react';
import { MapContainer, TileLayer, Marker, Circle, Polyline, Polygon, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useEffect, useState, useRef } from 'react';
import MarkerClusterGroup from 'react-leaflet-markercluster';
import L from 'leaflet';
import { supabase } from '../utils/supabaseClient';
import { menu as menuIcon, business as castleIcon, add as addIcon, close as closeIcon, checkmark as checkIcon, refresh as refreshIcon, locate as locateIcon } from 'ionicons/icons';

const PIN_IMAGE = '/pin.png';
const DEFAULT_AVATAR = '/default-avatar.png';

const DISTANCE_THRESHOLD = 1.5; // meters (less sensitive for small areas)
const MIN_AREA_POINTS = 10; // Minimum for agrarian area (1,000 sqm)

function getDistanceMeters(
  loc1: [number, number],
  loc2: [number, number]
): number {
  const [lat1, lng1] = loc1;
  const [lat2, lng2] = loc2;
  // Haversine formula
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getPathLength(path: [number, number][]): number {
  let dist = 0;
  for (let i = 1; i < path.length; i++) {
    dist += getDistanceMeters(path[i - 1], path[i]);
  }
  return dist;
}

// Helper to generate a marker icon with only the avatar (no pin)
async function generateMarkerIcon(avatarUrl: string | null, size = 48): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve(DEFAULT_AVATAR);

    // Draw avatar circle
    const avatarImg = new window.Image();
    avatarImg.crossOrigin = 'anonymous';
    avatarImg.src = avatarUrl || DEFAULT_AVATAR;
    avatarImg.onload = () => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatarImg, 0, 0, size, size);
      ctx.restore();
      resolve(canvas.toDataURL());
    };
    avatarImg.onerror = () => {
      // If avatar fails, use default avatar
      const fallbackImg = new window.Image();
      fallbackImg.crossOrigin = 'anonymous';
      fallbackImg.src = DEFAULT_AVATAR;
      fallbackImg.onload = () => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(fallbackImg, 0, 0, size, size);
        ctx.restore();
        resolve(canvas.toDataURL());
      };
      fallbackImg.onerror = () => {
        resolve(DEFAULT_AVATAR);
      };
    };
  });
}

// Helper: check if two line segments (p1-p2 and p3-p4) intersect
function segmentsIntersect(p1: [number, number], p2: [number, number], p3: [number, number], p4: [number, number]): boolean {
  function ccw(a: [number, number], b: [number, number], c: [number, number]) {
    return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
  }
  return (
    ccw(p1, p3, p4) !== ccw(p2, p3, p4) &&
    ccw(p1, p2, p3) !== ccw(p1, p2, p4)
  );
}

function snapToStart(path: [number, number][]): [number, number][] {
  if (path.length < 3) return path;
  return [...path.slice(0, -1), path[0]];
}

// Returns the minimum distance (in meters) from point p to segment [a, b]
function pointToSegmentDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const toRad = (deg: number) => deg * Math.PI / 180;
  const [lat, lng] = p;
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;

  // Convert to Cartesian coordinates for small distances
  const R = 6371000;
  const x = R * toRad(lng - lng1) * Math.cos(toRad((lat + lat1) / 2));
  const y = R * toRad(lat - lat1);

  const x2 = R * toRad(lng2 - lng1) * Math.cos(toRad((lat2 + lat1) / 2));
  const y2 = R * toRad(lat2 - lat1);

  const dx = x2;
  const dy = y2;
  const t = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy)));
  const projX = t * dx;
  const projY = t * dy;
  const dist = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);
  return dist;
}

// Calculate the area of a polygon (in square meters) using the Shoelace formula on the sphere
function getPolygonArea(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  // Use the spherical excess formula for more accuracy on Earth
  // For small areas, planar Shoelace is a good approximation
  const R = 6371000; // Earth radius in meters
  let area = 0;
  for (let i = 0, l = coords.length; i < l; i++) {
    const [lat1, lon1] = coords[i];
    const [lat2, lon2] = coords[(i + 1) % l];
    area += toRad(lon2 - lon1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  area = area * R * R / 2;
  return Math.abs(area); // Always positive
  function toRad(deg: number) { return deg * Math.PI / 180; }
}

const Home: React.FC = () => {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [markerIcon, setMarkerIcon] = useState<L.Icon | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverAnchor, setPopoverAnchor] = useState<any>(null);
  const [searchText, setSearchText] = useState('');
  const [mapping, setMapping] = useState(false);
  const [path, setPath] = useState<[number, number][]>([]);
  const [initialLoc, setInitialLoc] = useState<[number, number] | null>(null);
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [landAreas, setLandAreas] = useState<any[]>([]);
  const [selectedArea, setSelectedArea] = useState<any | null>(null);
  const [showToast, setShowToast] = useState(false);
  const watchId = useRef<number | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPosition([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => {
          console.error('Error getting location:', err);
        },
        { enableHighAccuracy: true }
      );
    }
    // Fetch user avatar from Supabase
    const fetchAvatar = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.email) {
        const { data: userData } = await supabase
          .from('users')
          .select('user_avatar_url')
          .eq('user_email', authData.user.email)
          .single();
        setAvatarUrl(userData?.user_avatar_url || null);
      }
    };
    fetchAvatar();
    return () => {};
  }, []);

  // Generate marker icon when avatarUrl changes
  useEffect(() => {
    let isMounted = true;
    generateMarkerIcon(avatarUrl).then((dataUrl) => {
      if (isMounted) {
        setMarkerIcon(
          L.icon({
            iconUrl: dataUrl,
    iconSize: [48, 48],
            iconAnchor: [24, 24],
            popupAnchor: [0, -24],
    className: 'user-avatar-marker',
          })
        );
      }
    });
    return () => {
      isMounted = false;
    };
  }, [avatarUrl]);

  // Load all land areas from DB on mount (only for current user)
  useEffect(() => {
    const fetchLandAreas = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userEmail = authData?.user?.email;
      if (!userEmail) return;
      const { data: userRow, error: userError } = await supabase
        .from('users')
        .select('user_id')
        .eq('user_email', userEmail)
        .single();
      if (userError || !userRow?.user_id) {
        console.error('User fetch error:', userError);
        return;
      }
      const userId = userRow.user_id;
      const { data, error } = await supabase
        .from('land_areas')
        .select('*')
        .eq('user_id', userId);
      if (error) {
        console.error('Land areas fetch error:', error);
      }
      setLandAreas(data || []);
    };
    fetchLandAreas();
    return () => {};
  }, []);

  // Start mapping
  const startMapping = () => {
    if (!position) return;
    setMapping(true);
    setPath([position]);
    // Start geolocation tracking
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newLoc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setPosition(newLoc);
        setPath((prev) => {
          const updated = [...prev, newLoc];
          // Only check for closure if there are at least 6 points
          if (updated.length > 6) {
            const lastIdx = updated.length - 1;
            for (let i = 0; i < lastIdx - 2; i++) {
              const dist = pointToSegmentDistance(updated[lastIdx], updated[i], updated[i + 1]);
              if (dist < DISTANCE_THRESHOLD) {
                // Close the polygon at the near-intersection
                const closedPath = snapToStart(updated.slice(i + 1, lastIdx + 1));
                setPath(closedPath);
                stopMapping();
                return closedPath;
              }
            }
          }
          return updated;
        });
      },
      (err) => {},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  };

  // Stop mapping
  const stopMapping = () => {
    setMapping(false);
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setShowOwnerModal(true);
  };

  // Manual finish
  const finishMapping = () => {
    if (path.length >= MIN_AREA_POINTS) {
      const areaSqm = getPolygonArea(snapToStart(path));
      if (areaSqm < 1000) {
        setShowToast(false); // Hide any previous toast
        setTimeout(() => {
          setShowToast(true);
        }, 100); // Show warning toast
        return;
      }
      setPath(snapToStart(path));
      stopMapping();
    }
  };

  // Reset mapping
  const resetMapping = () => {
    setMapping(false);
    setPath([]);
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setShowOwnerModal(false);
  };

  // Save land area to DB
  const saveLandArea = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const userEmail = authData?.user?.email;
    if (!userEmail || !ownerName || path.length < MIN_AREA_POINTS) return;

    // Fetch the integer user_id from users table
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_email', userEmail)
      .single();
    if (userError || !userRow?.user_id) {
      console.error('User fetch error:', userError);
      return;
    }
    const userId = userRow.user_id;

    // Insert the mapped area
    const { data: insertData, error: insertError } = await supabase.from('land_areas').insert({
      user_id: userId,
      owner_name: ownerName,
      path: path,
    });
    if (insertError) {
      console.error('Insert error:', insertError);
      return;
    }
    setLandAreas((prev) => [...prev, { user_id: userId, owner_name: ownerName, path }]);
    setShowOwnerModal(false);
    setOwnerName('');
    setPath([]);
    setMapping(false);
    setShowToast(true);
  };

  // Zoom to area
  function ZoomToArea({ area }: { area: any }) {
    const map = useMap();
    useEffect(() => {
      if (area && area.path && area.path.length > 0) {
        map.fitBounds(area.path);
      }
    }, [area, map]);
    return null;
  }

  // Handler for marker click
  const handleMarkerClick = (e: any) => {
    setPopoverAnchor({
      x: e.originalEvent.clientX,
      y: e.originalEvent.clientY,
    });
    setPopoverOpen(true);
  };

  // Handler for popover actions
  const handleAction = (action: string) => {
    setPopoverOpen(false);
    if (action === 'mapland') {
      startMapping();
    }
  };

  // Status overlay
  const mappingStatus = mapping && (
    <div style={{ position: 'absolute', top: 70, left: 10, zIndex: 1001, background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <IonText color="primary"><b>Mapping in progress...</b></IonText><br />
      <IonLabel>Points: {path.length}</IonLabel><br />
      <IonLabel>Distance: {getPathLength(path).toFixed(1)} m</IonLabel>
    </div>
  );

  // FABs for mapping controls
  const mappingFABs = mapping ? (
    <IonFab vertical="bottom" horizontal="end" slot="fixed" style={{ zIndex: 1001, marginBottom: '2.5rem', marginRight: '1rem' }}>
      <IonFabButton color="danger" onClick={resetMapping} title="Reset"><IonIcon icon={refreshIcon} /></IonFabButton>
      <IonFabButton color="medium" onClick={resetMapping} title="Stop"><IonIcon icon={closeIcon} /></IonFabButton>
      <IonFabButton color="success" onClick={finishMapping} title="Finish Area" disabled={path.length < MIN_AREA_POINTS}><IonIcon icon={checkIcon} /></IonFabButton>
    </IonFab>
  ) : (
    <IonFab vertical="bottom" horizontal="end" slot="fixed" style={{ zIndex: 1001, marginBottom: '2.5rem', marginRight: '1rem' }}>
      <IonFabButton color="primary" onClick={startMapping} title="Start Mapping"><IonIcon icon={addIcon} /></IonFabButton>
    </IonFab>
  );

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle style={{ display: 'flex', alignItems: 'center', fontWeight: 700, fontSize: '1.05rem', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <IonIcon icon={castleIcon} style={{ marginRight: 6, fontSize: '1.2rem', color: '#3a3a3a' }} />
            Landlord
          </IonTitle>
          <div slot="end" style={{ flex: 1, maxWidth: 300, marginLeft: '1rem' }}>
            <IonSearchbar
              value={searchText}
              onIonInput={e => setSearchText(e.detail.value!)}
              placeholder="Search location..."
              showClearButton="focus"
              style={{ minWidth: 180, maxWidth: 300, margin: 0 }}
              inputmode="search"
            />
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen style={{ padding: 0 }}>
        {/* Floating Burger Menu */}
        <IonFab vertical="top" horizontal="end" slot="fixed" style={{ zIndex: 1000, marginTop: '1rem', marginRight: '1rem' }}>
          <IonFabButton color="primary" onClick={() => document.querySelector('ion-menu')?.open()}> 
            <IonIcon icon={menuIcon} />
          </IonFabButton>
        </IonFab>
        {mappingStatus}
        {mappingFABs}
        {position && markerIcon && (
          <div style={{ width: '100vw', height: 'calc(100vh - 56px)', position: 'relative' }}>
            <MapContainer center={position} zoom={18} style={{ width: '100%', height: '100%' }} ref={mapRef}>
              <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" />
              {/* Only one marker for the user's current position */}
              <Marker position={position} icon={markerIcon} eventHandlers={{ click: handleMarkerClick }} />
              <Circle center={position} radius={10} pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.3 }} />
              {/* Draw current mapping path and preview area */}
              {mapping && path.length > 1 && (
                <>
                  <Polyline positions={path} pathOptions={{ color: 'red', weight: 4 }} />
                  {path.length >= MIN_AREA_POINTS && <Polygon positions={snapToStart(path)} pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.2, weight: 2 }} />}
                </>
              )}
              {/* Draw all saved land areas */}
              {landAreas.map((area, idx) => (
                <Polygon
                  key={`poly-${idx}`}
                  positions={area.path}
                  pathOptions={{ color: 'green', fillColor: 'green', fillOpacity: 0.3, weight: 2 }}
                  eventHandlers={{ click: () => setSelectedArea(area) }}
                />
              ))}
              {/* Show label for selected area */}
              {selectedArea && <ZoomToArea area={selectedArea} />}
            </MapContainer>
          </div>
        )}
        {!position && <div>Loading map...</div>}
        {/* Popover for marker actions */}
        <IonPopover
          isOpen={popoverOpen}
          onDidDismiss={() => setPopoverOpen(false)}
          event={popoverAnchor}
        >
          <IonList>
            <IonItem button onClick={() => handleAction('mapland')}>Map Land</IonItem>
            <IonItem button onClick={() => setPopoverOpen(false)}>Cancel</IonItem>
          </IonList>
        </IonPopover>
        {/* Modal for owner name input */}
        <IonModal isOpen={showOwnerModal} onDidDismiss={() => setShowOwnerModal(false)}>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <IonText><h2>Enter Land Owner's Name</h2></IonText>
            <IonInput
              value={ownerName}
              onIonChange={e => setOwnerName(e.detail.value!)}
              placeholder="Owner's Name"
              style={{ margin: '16px 0' }}
            />
            <IonButton expand="block" onClick={saveLandArea} disabled={!ownerName}>Save</IonButton>
            <IonButton expand="block" color="medium" onClick={() => setShowOwnerModal(false)}>Cancel</IonButton>
          </div>
        </IonModal>
        {/* Toast for success and area warning */}
        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message={
            path.length >= MIN_AREA_POINTS && getPolygonArea(snapToStart(path)) < 1000
              ? 'Area too small! Minimum is 1,000 sqm.'
              : 'Land area saved!'
          }
          duration={1500}
          position="top"
          color={
            path.length >= MIN_AREA_POINTS && getPolygonArea(snapToStart(path)) < 1000
              ? 'danger'
              : 'success'
          }
        />
        {/* Modal for area details */}
        <IonModal isOpen={!!selectedArea} onDidDismiss={() => setSelectedArea(null)}>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <IonText><h2>Land Area Details</h2></IonText>
            <IonLabel><b>Owner:</b> {selectedArea?.owner_name}</IonLabel><br />
            <IonLabel><b>Points:</b> {selectedArea?.path.length}</IonLabel><br />
            <IonButton expand="block" onClick={() => setSelectedArea(null)}>Close</IonButton>
          </div>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default Home;