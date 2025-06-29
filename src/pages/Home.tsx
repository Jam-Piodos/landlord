import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonFab, IonFabButton, IonIcon, IonPopover, IonList, IonItem, IonSearchbar, IonModal, IonInput, IonButton, IonLabel, IonText } from '@ionic/react';
import { MapContainer, TileLayer, Marker, Circle, Polyline, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useEffect, useState, useRef } from 'react';
import MarkerClusterGroup from 'react-leaflet-markercluster';
import L from 'leaflet';
import { supabase } from '../utils/supabaseClient';
import { menu as menuIcon, business as castleIcon } from 'ionicons/icons';

const PIN_IMAGE = '/pin.png';
const DEFAULT_AVATAR = '/default-avatar.png';

const DISTANCE_THRESHOLD = 10; // meters to consider 'return to start'

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
  const watchId = useRef<number | null>(null);

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

  // Load all land areas from DB on mount
  useEffect(() => {
    const fetchLandAreas = async () => {
      const { data } = await supabase.from('land_areas').select('*');
      setLandAreas(data || []);
    };
    fetchLandAreas();
    return () => {};
  }, []);

  // Start/stop mapping logic
  const startMapping = () => {
    if (!position) return;
    setMapping(true);
    setPath([position]);
    setInitialLoc(position);
    // Start geolocation tracking
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newLoc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setPath((prev) => {
          const updated = [...prev, newLoc];
          // Check for self-intersection
          if (updated.length > 3) {
            const lastIdx = updated.length - 1;
            for (let i = 0; i < lastIdx - 2; i++) {
              if (segmentsIntersect(updated[i], updated[i + 1], updated[lastIdx - 1], updated[lastIdx])) {
                // Close the polygon at the intersection
                const closedPath = updated.slice(i + 1, lastIdx + 1);
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

  const stopMapping = () => {
    setMapping(false);
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setShowOwnerModal(true);
  };

  // Save land area to DB
  const saveLandArea = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId || !ownerName || path.length < 3) return;
    await supabase.from('land_areas').insert({
      user_id: userId,
      owner_name: ownerName,
      path: path,
    });
    setLandAreas((prev) => [...prev, { user_id: userId, owner_name: ownerName, path }]);
    setShowOwnerModal(false);
    setOwnerName('');
    setPath([]);
    setInitialLoc(null);
  };

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
        {position && markerIcon && (
          <div style={{ width: '100vw', height: 'calc(100vh - 56px)', position: 'relative' }}>
            <MapContainer center={position} zoom={18} style={{ width: '100%', height: '100%' }}>
              <TileLayer
                url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
              />
              <Marker position={position} icon={markerIcon} eventHandlers={{ click: handleMarkerClick }} />
              <Circle center={position} radius={10} pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.3 }} />
              {/* Draw current mapping path */}
              {mapping && path.length > 1 && <Polyline positions={path} pathOptions={{ color: 'red', weight: 4 }} />}
              {/* Draw all saved land areas */}
              {landAreas.map((area, idx) => (
                <>
                  <Polygon
                    key={`poly-${idx}`}
                    positions={area.path}
                    pathOptions={{ color: 'green', fillColor: 'green', fillOpacity: 0.3, weight: 2 }}
                  />
                  <Polyline
                    key={`line-${idx}`}
                    positions={area.path}
                    pathOptions={{ color: 'green', weight: 3 }}
                  />
                </>
              ))}
            </MapContainer>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default Home;