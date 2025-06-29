import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonFab, IonFabButton, IonIcon, IonPopover, IonList, IonItem, IonSearchbar, IonModal, IonInput, IonButton, IonLabel, IonText, IonToast, IonMenu } from '@ionic/react';
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
import { menuController } from '@ionic/core';

const PIN_IMAGE = '/pin.png';
const DEFAULT_AVATAR = '/default-avatar.png';

const DISTANCE_THRESHOLD = 10; // meters for self-intersection
const MIN_AREA_POINTS = 4;

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

  // Load all land areas from DB on mount
  useEffect(() => {
    const fetchLandAreas = async () => {
      const { data } = await supabase.from('land_areas').select('*');
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
        setPath((prev) => {
          const updated = [...prev, newLoc];
          // Check for self-intersection
          if (updated.length > 3) {
            const lastIdx = updated.length - 1;
            for (let i = 0; i < lastIdx - 2; i++) {
              if (segmentsIntersect(updated[i], updated[i + 1], updated[lastIdx - 1], updated[lastIdx])) {
                // Close the polygon at the intersection
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
  };

  // Stop mapping and cancel (no prompt)
  const cancelMapping = () => {
    setMapping(false);
    setPath([]);
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  };

  // Save land area to DB
  const saveLandArea = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId || !ownerName || path.length < MIN_AREA_POINTS) return;
    await supabase.from('land_areas').insert({
      user_id: userId,
      owner_name: ownerName,
      path: path,
    });
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
      <IonFabButton color="medium" onClick={cancelMapping} title="Stop"><IonIcon icon={closeIcon} /></IonFabButton>
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
      <IonContent id="main-content" fullscreen style={{ padding: 0 }}>
        {/* Floating Burger Menu */}
        <IonFab vertical="top" horizontal="end" slot="fixed" style={{ zIndex: 1000, marginTop: '1rem', marginRight: '1rem' }}>
          <IonFabButton color="primary" onClick={() => menuController.open('main-menu')}>
            <IonIcon icon={menuIcon} />
          </IonFabButton>
        </IonFab>
        {mappingStatus}
        {mappingFABs}
        {position && markerIcon && (
          <div style={{ width: '100vw', height: 'calc(100vh - 56px)', position: 'relative' }}>
            <MapContainer center={position} zoom={18} style={{ width: '100%', height: '100%' }} ref={mapRef}>
              <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" />
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
              <MarkerClusterGroup>
                {position && <Marker position={position} icon={markerIcon} eventHandlers={{ click: handleMarkerClick }} />}
              </MarkerClusterGroup>
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
        {/* Toast for success */}
        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message="Land area saved!"
          duration={1500}
          position="top"
          color="success"
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
        <IonMenu menuId="main-menu" contentId="main-content" swipeGesture={false}>
          {/* ...menu content... */}
        </IonMenu>
      </IonContent>
    </IonPage>
  );
};

export default Home;