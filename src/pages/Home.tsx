import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonFab, IonFabButton, IonIcon, IonPopover, IonList, IonItem, IonSearchbar, IonModal, IonInput, IonButton, IonLabel, IonText, IonToast, IonSelect, IonSelectOption } from '@ionic/react';
import { MapContainer, TileLayer, Marker, Circle, Polyline, Polygon, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import React, { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import { supabase } from '../utils/supabaseClient';
import { menu as menuIcon, business as castleIcon, add as addIcon, close as closeIcon, checkmark as checkIcon, refresh as refreshIcon } from 'ionicons/icons';
import { locationOutline } from 'ionicons/icons';

const PIN_IMAGE = '/pin.png';
const DEFAULT_AVATAR = '/default-avatar.png';

const DISTANCE_THRESHOLD = 1.5; // meters (less sensitive for small areas)
const MIN_AREA_POINTS = 4; // Minimum for a valid polygon (quadrilateral)

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

// Helper: compute centroid of a polygon
function getPolygonCentroid(coords: [number, number][]): [number, number] {
  let x = 0, y = 0, n = coords.length;
  for (let i = 0; i < n; i++) {
    x += coords[i][0];
    y += coords[i][1];
  }
  return [x / n, y / n];
}

// Helper to calculate bearing
function getBearing(from: [number, number], to: [number, number]): number {
  const [lat1, lon1] = from.map((d) => d * Math.PI / 180);
  const [lat2, lon2] = to.map((d) => d * Math.PI / 180);
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

const Home: React.FC = () => {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [markerIcon, setMarkerIcon] = useState<L.Icon | null>(null);
  const [searchText, setSearchText] = useState('');
  const [mapping, setMapping] = useState(false);
  const [path, setPath] = useState<[number, number][]>([]); // Marked points
  const [walkedPath, setWalkedPath] = useState<[number, number][]>([]); // Breadcrumb trail
  const watchId = useRef<number | null>(null);
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [landAreas, setLandAreas] = useState<any[]>([]);
  const [selectedArea, setSelectedArea] = useState<any | null>(null);
  const [showToast, setShowToast] = useState(false);
  const mapRef = useRef<any>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  // Add state for in-app directions
  const [directions, setDirections] = useState<null | {
    centroid: [number, number],
    nearest: [number, number],
    centroidDist: number,
    centroidBearing: number,
    nearestDist: number,
    nearestBearing: number,
  }>(null);
  // Add state for directions popover
  const [directionsPopover, setDirectionsPopover] = useState<{ open: boolean, event: any } | null>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distance: number, duration: number } | null>(null);
  const [areaPopover, setAreaPopover] = useState<{ open: boolean, event: any, area: any } | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFields, setEditFields] = useState<any>({});
  const [editPassword, setEditPassword] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [editError, setEditError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeletePasswordPrompt, setShowDeletePasswordPrompt] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewFields, setViewFields] = useState<any>({});

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

  // Load all land areas from DB on mount (all users)
  useEffect(() => {
    const fetchLandAreas = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userEmail = authData?.user?.email;
      let currentUserId: number | null = null;
      if (userEmail) {
        const { data: userRow, error: userError } = await supabase
          .from('users')
          .select('user_id')
          .eq('user_email', userEmail)
          .single();
        if (!userError && userRow?.user_id) {
          currentUserId = userRow.user_id;
        }
      }
      // Fetch all land areas
      const { data, error } = await supabase
        .from('land_areas')
        .select('*');
      if (error) {
        console.error('Land areas fetch error:', error);
      }
      setLandAreas(data || []);
      setCurrentUserId(currentUserId); // Save for highlighting
    };
    fetchLandAreas();
    return () => {};
  }, []);

  // Start mapping (begin geolocation tracking)
  const startMapping = () => {
    setMapping(true);
    setPath([]);
    setWalkedPath([]);
    if (navigator.geolocation) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newLoc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setPosition(newLoc);
          setWalkedPath((prev) => [...prev, newLoc]);
        },
        (err) => {},
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
      );
    }
  };

  // Mark current position as a land marker
  const markHere = () => {
    if (!position) return;
    setPath((prev) => [...prev, position]);
    setWalkedPath([position]); // Start new walked segment from here
  };

  // Finish mapping: close polygon
  const finishMapping = () => {
    if (path.length < MIN_AREA_POINTS) return;
    setPath((prev) => (prev.length > 2 && (prev[0][0] !== prev[prev.length-1][0] || prev[0][1] !== prev[prev.length-1][1])) ? [...prev, prev[0]] : prev);
    setMapping(false);
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setWalkedPath([]);
    setShowOwnerModal(true);
  };

  // Reset mapping
  const resetMapping = () => {
    setMapping(false);
    setPath([]);
    setWalkedPath([]);
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setShowOwnerModal(false);
  };

  // Cancel mapping
  const cancelMapping = () => {
    setMapping(false);
    setPath([]);
    setWalkedPath([]);
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
    if (!userEmail || path.length < MIN_AREA_POINTS) {
      setShowToast(true);
      return;
    }
    if (!ownerName || ownerName.trim() === '') {
      setShowToast(true);
      return;
    }
    // Fetch the integer user_id from users table
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_email', userEmail)
      .single();
    if (userError || !userRow?.user_id) {
      setShowToast(true);
      return;
    }
    const userId = userRow.user_id;
    const landAreaData = { user_id: userId, path: path };
    const ownerData = {
      name: ownerName,
      user_id: userId,
    };
    if (!navigator.onLine) {
      savePendingLandArea(landAreaData, ownerData);
      setShowToast(true);
      setShowOwnerModal(false);
      setOwnerName('');
      setPath([]);
      setMapping(false);
      // Optionally scroll or focus map here if needed
      return;
    }
    // Insert the mapped area (land_areas)
    const { data: insertData, error: insertError } = await supabase
      .from('land_areas')
      .insert(landAreaData)
      .select();
    if (insertError || !insertData || !insertData[0]) {
      setShowToast(true);
      return;
    }
    const newLandAreaId = (insertData[0] as any).id;
    // Insert owner details (owners table)
    const { error: ownerError } = await supabase.from('owners').insert({ ...ownerData, land_area_id: newLandAreaId });
    if (ownerError) {
      setShowToast(true);
      return;
    }
    setLandAreas((prev) => [...prev, { user_id: userId, path, id: newLandAreaId }]);
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
  // Remove popover state and handler
  // Remove IonPopover component from the render
  // Remove handleMarkerClick and handleAction functions
  // Remove popoverOpen, popoverAnchor from state
  // Remove eventHandlers={{ click: handleMarkerClick }} from the profile marker

  // Status overlay
  const mappingStatus = mapping && (
    <div style={{ position: 'absolute', top: 70, left: 10, zIndex: 1001, background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <IonText color="primary"><b>Mapping in progress...</b></IonText><br />
      <IonLabel>Markers: {path.length}</IonLabel><br />
      <IonLabel>Distance: {getPathLength(path).toFixed(1)} m</IonLabel>
    </div>
  );

  // In-app directions handler
  const handleGetDirections = (e: any) => {
    if (!selectedArea || !position) return;
    const centroid = getPolygonCentroid(selectedArea.path);
    setDirectionsPopover({ open: true, event: e.nativeEvent });
    fetchRoute(position, centroid);
  };

  // Fetch route from OSRM API
  async function fetchRoute(from: [number, number], to: [number, number]) {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes[0]) {
      const coords = data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
      setRouteCoords(coords);
      setRouteInfo({ distance: data.routes[0].distance, duration: data.routes[0].duration });
    } else {
      setRouteCoords([]);
      setRouteInfo(null);
    }
  }

  // Mapping controls (FAB group)
  const mappingFABs = mapping ? (
    <div style={{ position: 'fixed', bottom: '2.5rem', right: '1rem', zIndex: 1001, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <IonButton color="primary" onClick={markHere} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <IonIcon icon={locationOutline} slot="start" />
        Mark Here
      </IonButton>
      <IonButton color="success" onClick={finishMapping} disabled={path.length < MIN_AREA_POINTS} style={{ marginBottom: 8 }}>
        <IonIcon icon={checkIcon} slot="start" />
        Done
      </IonButton>
      <IonButton color="medium" onClick={cancelMapping} style={{ marginBottom: 8 }}>
        <IonIcon icon={closeIcon} slot="start" />
        Cancel
      </IonButton>
      <IonButton color="danger" onClick={resetMapping} >
        <IonIcon icon={refreshIcon} slot="start" />
        Reset
      </IonButton>
    </div>
  ) : (
    <IonFab vertical="bottom" horizontal="end" slot="fixed" style={{ zIndex: 1001, marginBottom: '2.5rem', marginRight: '1rem' }}>
      <IonFabButton color="primary" onClick={startMapping} title="Start Mapping"><IonIcon icon={addIcon} /></IonFabButton>
    </IonFab>
  );

  // Use an inline SVG for the location-outline icon in white
  const locationOutlineSVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512' width='28' height='28' style='display:block'><path fill='none' stroke='white' stroke-width='32' stroke-linecap='round' stroke-linejoin='round' d='M256 48v416M400 256H112'/></svg>`;

  // Use a simple white circle for saved area vertices
  const whiteCircleHTML = `<div style='width:18px;height:18px;border-radius:50%;background:white;border:2px solid #333;box-shadow:0 0 4px #0003;'></div>`;

  // After successful edit or delete, refresh land areas
  const refreshLandAreas = async () => {
    const { data, error } = await supabase.from('land_areas').select('*');
    if (!error) setLandAreas(data || []);
  };

  // When opening View Land Info or Edit Land Info, fetch owner by land_area_id
  const openViewLandInfo = async (area: any) => {
    const { data: ownerData } = await supabase.from('owners').select('*').eq('land_area_id', area.id).single();
    if (ownerData) {
      setViewFields({
        ownerName: ownerData.name || '',
        areaId: area.id,
        ownerId: ownerData.id,
        createdAt: ownerData.created_at || '',
      });
      setShowViewModal(true);
    }
  };
  const openEditLandInfo = async (area: any) => {
    const { data: ownerData } = await supabase.from('owners').select('*').eq('land_area_id', area.id).single();
    if (ownerData) {
      setEditFields({
        ownerName: ownerData.name || '',
        areaId: area.id,
        ownerId: ownerData.id,
        path: area.path,
      });
      setShowEditModal(true);
    }
  };

  // Utility: Save pending land areas to localStorage
  const savePendingLandArea = (landArea: any, owner: any) => {
    const pending = JSON.parse(localStorage.getItem('pendingLandAreas') || '[]');
    pending.push({ landArea, owner });
    localStorage.setItem('pendingLandAreas', JSON.stringify(pending));
  };

  // Utility: Sync pending land areas from localStorage
  const syncPendingLandAreas = async () => {
    const pending = JSON.parse(localStorage.getItem('pendingLandAreas') || '[]');
    for (const item of pending) {
      try {
        // Insert land area
        const { data: insertData, error: insertError } = await supabase
          .from('land_areas')
          .insert(item.landArea)
          .select();
        if (insertError || !insertData || !insertData[0]) continue;
        const newLandAreaId = (insertData[0] as any).id;
        // Insert owner
        await supabase.from('owners').insert({ ...item.owner, land_area_id: newLandAreaId });
      } catch (e) { /* ignore */ }
    }
    if (pending.length > 0) {
      localStorage.removeItem('pendingLandAreas');
      setShowToast(true);
      await refreshLandAreas();
    }
  };

  // Effect: Sync on reconnect
  React.useEffect(() => {
    const handleOnline = () => { syncPendingLandAreas(); };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Polling: refresh land areas every 5 seconds, only when no modal/popover is open
  React.useEffect(() => {
    const isAnyModalOpen = showOwnerModal || showEditModal || showViewModal || showPasswordPrompt || showDeleteConfirm || showDeletePasswordPrompt || (areaPopover && areaPopover.open);
    if (isAnyModalOpen) return;
    const interval = setInterval(() => {
      refreshLandAreas();
    }, 5000);
    return () => clearInterval(interval);
  }, [showOwnerModal, showEditModal, showViewModal, showPasswordPrompt, showDeleteConfirm, showDeletePasswordPrompt, areaPopover]);

  // Supabase Realtime: subscribe to land_areas changes, only when no modal/popover is open
  React.useEffect(() => {
    const isAnyModalOpen = showOwnerModal || showEditModal || showViewModal || showPasswordPrompt || showDeleteConfirm || showDeletePasswordPrompt || (areaPopover && areaPopover.open);
    if (isAnyModalOpen) return;
    const channel = supabase
      .channel('realtime:land_areas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'land_areas' }, payload => {
        refreshLandAreas();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [showOwnerModal, showEditModal, showViewModal, showPasswordPrompt, showDeleteConfirm, showDeletePasswordPrompt, areaPopover]);

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
              <Marker position={position} icon={markerIcon} />
              <Circle center={position} radius={10} pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.3 }} />
              {/* Draw current mapping path and preview area */}
              {mapping && (
                <>
                  {/* Draw walked path as gray polyline */}
                  {walkedPath.length > 1 && (
                    <Polyline positions={walkedPath} pathOptions={{ color: 'gray', weight: 2, dashArray: '6 6' }} />
                  )}
                  {/* Draw circles at each marker */}
                  {path.map((pt, idx) => (
                    <Circle key={`marker-${idx}`} center={pt} radius={2.5} pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 1 }} />
                  ))}
                  {/* Draw lines between markers (polygon) */}
                  {path.length > 1 && (
                    <Polyline positions={path} pathOptions={{ color: 'blue', weight: 3 }} />
                  )}
                  {/* Draw polygon preview if closed */}
                  {path.length > 2 && path[0] && path[path.length-1] && path[0][0] === path[path.length-1][0] && path[0][1] === path[path.length-1][1] && (
                    <Polygon positions={path} pathOptions={{ color: 'green', fillColor: 'green', fillOpacity: 0.2, weight: 2 }} />
                  )}
                </>
              )}
              {/* Draw all saved land areas */}
              {landAreas.map((area, idx) => (
                <React.Fragment key={`poly-${idx}`}>
                  <Polygon
                    positions={area.path}
                    pathOptions={{
                      color: area.user_id === currentUserId ? 'blue' : 'green',
                      fillColor: area.user_id === currentUserId ? 'blue' : 'green',
                      fillOpacity: 0.5,
                      weight: 4
                    }}
                    eventHandlers={
                      area.user_id === currentUserId
                        ? { click: (e: any) => setAreaPopover({ open: true, event: e.originalEvent, area }) }
                        : undefined
                    }
                  />
                  {/* Show white circle at each vertex */}
                  {area.path.map((pt: [number, number], i: number) => (
                    <Marker
                      key={`area-marker-${idx}-${i}`}
                      position={pt}
                      icon={L.divIcon({
                        className: '',
                        html: whiteCircleHTML,
                        iconSize: [18, 18],
                        iconAnchor: [9, 9],
                      })}
                      interactive={false}
                    />
                  ))}
                </React.Fragment>
              ))}
              {/* Show label for selected area */}
              {selectedArea && <ZoomToArea area={selectedArea} />}
              {directions && (
                <>
                  {/* Line to centroid (green) */}
                  <Polyline positions={[position, directions.centroid]} pathOptions={{ color: 'green', weight: 4, dashArray: '8 8' }} />
                  {/* Line to nearest vertex (blue) */}
                  <Polyline positions={[position, directions.nearest]} pathOptions={{ color: 'blue', weight: 4, dashArray: '4 8' }} />
                  {/* Markers for destination points */}
                  <Marker position={directions.centroid} icon={L.divIcon({ className: '', html: whiteCircleHTML, iconSize: [18, 18], iconAnchor: [9, 9] })} interactive={false} />
                  <Marker position={directions.nearest} icon={L.divIcon({ className: '', html: whiteCircleHTML, iconSize: [18, 18], iconAnchor: [9, 9] })} interactive={false} />
                </>
              )}
              {/* Draw the route polyline if present */}
              {routeCoords.length > 1 && (
                <Polyline positions={routeCoords} pathOptions={{ color: 'orange', weight: 5 }} />
              )}
            </MapContainer>
          </div>
        )}
        {!position && <div>Loading map...</div>}
        {/* Modal for owner name input */}
        <IonModal className="dar-modal" isOpen={showOwnerModal} onDidDismiss={() => {
  setShowOwnerModal(false);
  setOwnerName('');
  setPath([]);
  setMapping(false);
}}>
  <div style={{ maxWidth: 340, margin: '0 auto', background: 'var(--dar-white)', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: 32, textAlign: 'center' }}>
    <IonText className="dar-title" style={{ fontSize: '1.3rem', color: 'var(--dar-green)', fontWeight: 700, marginBottom: 12 }}>Enter Land Owner's Name</IonText>
    <div className="dar-divider" style={{ margin: '16px 0' }}></div>
    <IonInput className="dar-input" label="Owner's Name" labelPlacement="floating" value={ownerName} onIonChange={e => setOwnerName(e.detail.value!)} placeholder="Owner's Name" style={{ margin: '16px 0', fontSize: '1.1rem' }} />
    <IonButton className="dar-btn" expand="block" style={{ marginTop: 24 }} onClick={saveLandArea} disabled={!ownerName}>Save</IonButton>
    <IonButton className="dar-btn" expand="block" color="medium" style={{ marginTop: 8 }} onClick={() => {
      setShowOwnerModal(false);
      setOwnerName('');
      setPath([]);
      setMapping(false);
    }}>Cancel</IonButton>
  </div>
</IonModal>
        {/* Toast for success and area warning */}
        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message={'Land area saved!'}
          duration={1500}
          position="top"
          color={'success'}
        />
        {/* Modal for area details */}
        <IonModal className="dar-modal" isOpen={!!selectedArea} onDidDismiss={() => { setSelectedArea(null); setDirections(null); setRouteCoords([]); setRouteInfo(null); setDirectionsPopover(null); }}>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <IonText><h2>Land Area Details</h2></IonText>
            <IonLabel><b>Owner:</b> {selectedArea?.owner_name}</IonLabel><br />
            <IonLabel><b>Points:</b> {selectedArea?.path.length}</IonLabel><br />
            <IonButton className="dar-btn" expand="block" onClick={() => { setSelectedArea(null); setDirections(null); setRouteCoords([]); setRouteInfo(null); setDirectionsPopover(null); }}>Close</IonButton>
            {selectedArea && position && (
              <IonButton className="dar-btn" expand="block" color="primary" onClick={handleGetDirections} style={{ marginTop: 12 }}>
                Get Directions
              </IonButton>
            )}
          </div>
        </IonModal>
        {/* Add IonPopover for directions info */}
        <IonPopover className="dar-popover" isOpen={!!directionsPopover?.open} event={directionsPopover?.event} onDidDismiss={() => { setDirectionsPopover(null); setRouteCoords([]); setRouteInfo(null); }}>
          <div style={{ padding: 16, minWidth: 220 }}>
            <b>Directions (in-app):</b><br />
            {routeInfo ? (
              <>
                <b>Distance:</b> {(routeInfo.distance/1000).toFixed(2)} km<br />
                <b>Estimated Time:</b> {Math.round(routeInfo.duration/60)} min<br />
              </>
            ) : (
              <span>Loading route...</span>
            )}
            <IonButton className="dar-btn" expand="block" color="medium" size="small" onClick={() => { setDirectionsPopover(null); setRouteCoords([]); setRouteInfo(null); }} style={{ marginTop: 8 }}>Close</IonButton>
          </div>
        </IonPopover>
        <IonPopover className="dar-popover" isOpen={!!areaPopover?.open} event={areaPopover?.event} onDidDismiss={() => setAreaPopover(null)}>
          <IonList className="dar-list">
            <IonItem className="dar-list-item" button onClick={() => {
              openViewLandInfo(areaPopover?.area);
              setAreaPopover(null);
            }}>
              View Land Info
            </IonItem>
            <IonItem className="dar-list-item" button onClick={() => {
              openEditLandInfo(areaPopover?.area);
              setAreaPopover(null);
            }}>
              Edit Land Info
            </IonItem>
            <IonItem className="dar-list-item" button onClick={() => {
              setDeleteTarget(areaPopover?.area);
              setShowDeleteConfirm(true);
              setAreaPopover(null);
            }} color="danger">
              Delete Land
            </IonItem>
            <IonItem className="dar-list-item" button onClick={() => {
              setSelectedArea(areaPopover?.area);
              setAreaPopover(null);
              setTimeout(() => handleGetDirections({ nativeEvent: areaPopover?.event }), 0);
            }}>
              Get Directions
            </IonItem>
            <IonItem className="dar-list-item" button onClick={() => setAreaPopover(null)}>
              Nevermind
            </IonItem>
          </IonList>
        </IonPopover>
        <IonModal className="dar-modal" isOpen={showEditModal} onDidDismiss={() => { setShowEditModal(false); setEditPassword(''); setEditError(''); }}>
  <div style={{ maxWidth: 340, margin: '0 auto', background: 'var(--dar-white)', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: 32, textAlign: 'center' }}>
    <IonText className="dar-title" style={{ fontSize: '1.3rem', color: 'var(--dar-green)', fontWeight: 700, marginBottom: 12 }}>Edit Land Info</IonText>
    <div className="dar-divider" style={{ margin: '16px 0' }}></div>
    <IonInput className="dar-input" label="Owner's Name" labelPlacement="floating" value={editFields.ownerName} onIonChange={e => setEditFields((prev: any) => ({ ...prev, ownerName: e.detail.value! }))} placeholder="Owner's Name" style={{ margin: '16px 0', fontSize: '1.1rem' }} />
    {editError && <IonText color="danger"><div style={{ margin: '8px 0' }}>{editError}</div></IonText>}
    <IonButton className="dar-btn" expand="block" style={{ marginTop: 24 }} onClick={() => setShowPasswordPrompt(true)}>Save</IonButton>
    <IonButton className="dar-btn" expand="block" color="medium" style={{ marginTop: 8 }} onClick={() => { setShowEditModal(false); setEditPassword(''); setEditError(''); }}>Cancel</IonButton>
  </div>
</IonModal>
        <IonModal className="dar-modal" isOpen={showPasswordPrompt} onDidDismiss={() => { setShowPasswordPrompt(false); setEditPassword(''); setEditError(''); }}>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <IonText><h2>Confirm Password</h2></IonText>
            <IonInput className="dar-input" type="password" value={editPassword} onIonChange={e => setEditPassword(e.detail.value!)} placeholder="Enter your password" style={{ margin: '16px 0' }} />
            {editError && <IonText color="danger"><div style={{ margin: '8px 0' }}>{editError}</div></IonText>}
            <IonButton className="dar-btn" expand="block" onClick={async () => {
              setEditError('');
              // Get current user email
              const { data: authData } = await supabase.auth.getUser();
              const userEmail = authData?.user?.email;
              if (!userEmail) { setEditError('No user.'); return; }
              // Try to sign in with password
              const { error: pwError } = await supabase.auth.signInWithPassword({ email: userEmail, password: editPassword });
              if (pwError) { setEditError('Incorrect password.'); return; }
              // Update owner
              if (editFields.ownerId) {
                const { error: ownerError } = await supabase.from('owners').update({
                  name: editFields.ownerName,
                }).eq('id', editFields.ownerId);
                if (ownerError) { setEditError('Failed to update owner.'); return; }
              }
              // Update land_areas if needed (e.g. owner_name or path changed)
              if (editFields.areaId) {
                const { error: landError } = await supabase.from('land_areas').update({
                  path: editFields.path,
                }).eq('id', editFields.areaId);
                if (landError) { setEditError('Failed to update land area.'); return; }
              }
              setShowEditModal(false);
              setShowPasswordPrompt(false);
              setEditPassword('');
              setEditError('');
              await refreshLandAreas();
            }}>Confirm</IonButton>
            <IonButton className="dar-btn" expand="block" color="medium" onClick={() => { setShowPasswordPrompt(false); setEditPassword(''); setEditError(''); }}>Cancel</IonButton>
          </div>
        </IonModal>
        <IonModal className="dar-modal" isOpen={showDeleteConfirm} onDidDismiss={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }}>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <IonText color="danger"><h2>Delete Land Area?</h2></IonText>
            <div style={{ margin: '16px 0' }}>Are you sure you want to delete this land area? This action cannot be undone.</div>
            <IonButton className="dar-btn" expand="block" color="danger" onClick={() => { setShowDeleteConfirm(false); setShowDeletePasswordPrompt(true); }}>Yes, Delete</IonButton>
            <IonButton className="dar-btn" expand="block" color="medium" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); setDeleteTarget(null); }}>No, Cancel</IonButton>
          </div>
        </IonModal>
        <IonModal className="dar-modal" isOpen={showDeletePasswordPrompt} onDidDismiss={() => { setShowDeletePasswordPrompt(false); setDeletePassword(''); setDeleteError(''); setDeleteTarget(null); }}>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <IonText><h2>Confirm Password</h2></IonText>
            <IonInput className="dar-input" type="password" value={deletePassword} onIonChange={e => setDeletePassword(e.detail.value!)} placeholder="Enter your password" style={{ margin: '16px 0' }} />
            {deleteError && <IonText color="danger"><div style={{ margin: '8px 0' }}>{deleteError}</div></IonText>}
            <IonButton className="dar-btn" expand="block" color="danger" onClick={async () => {
              setDeleteError('');
              // Get current user email
              const { data: authData } = await supabase.auth.getUser();
              const userEmail = authData?.user?.email;
              if (!userEmail) { setDeleteError('No user.'); return; }
              // Try to sign in with password
              const { error: pwError } = await supabase.auth.signInWithPassword({ email: userEmail, password: deletePassword });
              if (pwError) { setDeleteError('Incorrect password.'); return; }
              // Delete land area
              if (deleteTarget?.id) {
                const { error: landError } = await supabase.from('land_areas').delete().eq('id', deleteTarget.id);
                if (landError) { setDeleteError('Failed to delete land area.'); return; }
              }
              // Optionally delete owner if no other land areas reference them
              if (deleteTarget?.owner_name) {
                const { data: otherAreas } = await supabase.from('land_areas').select('id').eq('owner_name', deleteTarget.owner_name);
                if (!otherAreas || otherAreas.length === 0) {
                  await supabase.from('owners').delete().eq('name', deleteTarget.owner_name);
                }
              }
              setShowDeletePasswordPrompt(false);
              setDeletePassword('');
              setDeleteError('');
              setDeleteTarget(null);
              await refreshLandAreas();
            }}>Confirm Delete</IonButton>
            <IonButton className="dar-btn" expand="block" color="medium" onClick={() => { setShowDeletePasswordPrompt(false); setDeletePassword(''); setDeleteError(''); setDeleteTarget(null); }}>Cancel</IonButton>
          </div>
        </IonModal>
        <IonModal className="dar-modal" isOpen={showViewModal} onDidDismiss={() => setShowViewModal(false)}>
  <div style={{ maxWidth: 340, margin: '0 auto', background: 'var(--dar-white)', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: 32, textAlign: 'center' }}>
    <IonText className="dar-title" style={{ fontSize: '1.3rem', color: 'var(--dar-green)', fontWeight: 700, marginBottom: 12 }}>Land Info</IonText>
    <div className="dar-divider" style={{ margin: '16px 0' }}></div>
    <IonLabel className="dar-label" style={{ fontSize: '1.1rem', marginBottom: 16, display: 'block' }}><b>Owner's Name:</b><br /><span style={{ color: 'var(--dar-yellow)', fontSize: '1.2rem' }}>{viewFields.ownerName}</span></IonLabel>
    {viewFields.createdAt && (
      <IonLabel className="dar-label" style={{ fontSize: '1rem', marginBottom: 12, display: 'block' }}><b>Added At:</b> {new Date(viewFields.createdAt).toLocaleString()}</IonLabel>
    )}
    <IonButton className="dar-btn" expand="block" style={{ marginTop: 24 }} onClick={() => setShowViewModal(false)}>Close</IonButton>
  </div>
</IonModal>
      </IonContent>
    </IonPage>
  );
};

export default Home;