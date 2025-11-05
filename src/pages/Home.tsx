import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonFab, IonFabButton, IonIcon, IonPopover, IonList, IonItem, IonSearchbar, IonModal, IonInput, IonButton, IonLabel, IonText, IonToast, IonSelect, IonSelectOption } from '@ionic/react';
import { MapContainer, TileLayer, Marker, Circle, Polyline, Polygon, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import React, { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import { supabase } from '../utils/supabaseClient';
import { logActivity } from '../utils/logger';
import { menu as menuIcon, business as castleIcon, add as addIcon, close as closeIcon, checkmark as checkIcon, refresh as refreshIcon, eyeOutline, camera as cameraIcon } from 'ionicons/icons';
import { locationOutline } from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import exifr from 'exifr';

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

// Helper: robustly normalize various path formats to [lat, lng][]
function normalizePathToLatLngArray(raw: any): [number, number][] | null {
  let value: any = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  // If GeoJSON Polygon or MultiPolygon
  if (value && typeof value === 'object' && value.type && value.coordinates) {
    const coords = value.type === 'Polygon'
      ? value.coordinates[0]
      : (value.type === 'MultiPolygon' ? value.coordinates[0][0] : null);
    if (!Array.isArray(coords)) return null;
    return normalizeArrayOfPairs(coords);
  }
  // If already array
  if (Array.isArray(value)) {
    const first = value[0];
    // Case: array of number pairs [[lat,lng], ...] or [[[...]]]
    if (Array.isArray(first) && typeof first[0] === 'number') {
      return normalizeArrayOfPairs(value as any);
    }
    if (Array.isArray(first) && Array.isArray(first[0])) {
      return normalizeArrayOfPairs(first as any);
    }
    // Case: array of objects [{lat,lng}] or [{latitude, longitude}]
    if (first && typeof first === 'object') {
      const toPairs = (arr: any[]): any[] => arr.map((pt: any) => {
        const lat = pt.lat ?? pt.latitude ?? pt.y;
        const lng = pt.lng ?? pt.longitude ?? pt.x;
        if (typeof lat === 'number' && typeof lng === 'number') return [lat, lng];
        return null;
      }).filter(Boolean);
      const pairs = toPairs(value);
      if (pairs.length >= 3) return normalizeArrayOfPairs(pairs as any);
    }
  }
  return null;
  
  function normalizeArrayOfPairs(pairs: any[]): [number, number][] | null {
    if (!Array.isArray(pairs)) return null;
    const sample = pairs.slice(0, Math.min(5, pairs.length));
    const likelyLngLat = sample.filter((pt: any) => Array.isArray(pt) && pt.length >= 2 && Math.abs(pt[0]) <= 180 && Math.abs(pt[1]) <= 90).length >= Math.ceil(Math.max(1, sample.length) / 2);
    const converted = pairs
      .map((pt: any) => Array.isArray(pt) && pt.length >= 2 ? (likelyLngLat ? [pt[1], pt[0]] : [pt[0], pt[1]]) : null)
      .filter((pt: any) => Array.isArray(pt) && isFinite(pt[0]) && isFinite(pt[1])) as [number, number][];
    // Remove trailing duplicate closing point if present
    if (converted.length > 2) {
      const a = converted[0];
      const b = converted[converted.length - 1];
      if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) {
        converted.pop();
      }
    }
    return converted.length >= 3 ? converted : null;
  }
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
  // Add state for tasks
  const [tasks, setTasks] = useState<any[]>([]);
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
  const [viewEditMode, setViewEditMode] = useState(false);
  const editingAreaIdRef = useRef<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [exifData, setExifData] = useState<any>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showImageUpdateConfirm, setShowImageUpdateConfirm] = useState(false);
  const [pendingImageData, setPendingImageData] = useState<{image: string, exif: any} | null>(null);

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

  // Load tasks first, then land areas assigned to current user for surveying
  useEffect(() => {
    const fetchTasksAndLandAreas = async () => {
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
      
      console.log('Current user ID:', currentUserId);
      
      if (currentUserId) {
      const { data, error } = await supabase
          .from('assigned_polygons')
          .select('task_id, assigned_to, land_area_id, path')
          .eq('assigned_to', currentUserId);

      if (error) {
          console.error(error);
          setLandAreas([]);
          setTasks([]);
          await logActivity('load_assignments', { status: 'failed' });
          return;
        }

        setTasks(data || []);
        await logActivity('load_assignments', { status: 'succeeded' });

        const polygons = (data || [])
          .map(r => ({ id: r.land_area_id, path: normalizePathToLatLngArray(r.path) }))
          .filter(a => Array.isArray(a.path) && a.path.length >= 3);

        setLandAreas(polygons);
      } else {
        setTasks([]);
        setLandAreas([]);
      }
      
      setCurrentUserId(currentUserId); // Save for highlighting
    };
    fetchTasksAndLandAreas();
    return () => {};
  }, []);

  // When navigated from the menu card, center map to the selected parcel
  useEffect(() => {
    try {
      const raw = localStorage.getItem('selectedTask');
      if (!raw || !landAreas || landAreas.length === 0) return;
      const task = JSON.parse(raw);
      const areaId = task?.land_area_id;
      if (!areaId) return;
      const area = landAreas.find(a => String(a.id) === String(areaId));
      if (area && Array.isArray(area.path) && area.path.length > 2) {
        // Log navigation-to-area activity
        (async () => {
          try {
            const { data: authData } = await supabase.auth.getUser();
            const email = authData?.user?.email;
            let userId: number | null = null;
            if (email) {
              const { data: userRow } = await supabase
                .from('users')
                .select('user_id')
                .eq('user_email', email)
                .single();
              userId = userRow?.user_id ?? null;
            }
            await supabase.from('activity_logs').insert({
              user_id: userId,
              action: 'center_to_parcel',
              entity_type: 'land_area',
              entity_id: String(areaId),
              details: { trigger: 'card_click' }
            } as any);
          } catch {}
        })();
        setSelectedArea(area);
        // Clear after using so it doesn't keep re-centering
        localStorage.removeItem('selectedTask');
      }
    } catch {}
  }, [landAreas]);

  // Lightweight mapping functions for updating an area's points
  const startUpdatePoints = (area: any) => {
    if (!area) return;
    logActivity('start_mapping');
    // Remember which area to return to
    editingAreaIdRef.current = area.id;
    setSelectedArea(null);
    // Start from zero points per request
    setPath([]);
    setWalkedPath([]);
    setMapping(true);
    if (navigator.geolocation) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newLoc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setPosition(newLoc);
          setWalkedPath((prev) => [...prev, newLoc]);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
      );
    }
    // Hide polygons while mapping for a clean canvas
  };

  const markHere = () => {
    if (!position) return;
    setPath((prev) => [...prev, position]);
    setWalkedPath([position]);
    logActivity('mark_point');
  };

  const finishMapping = async () => {
    if (!selectedArea && !editingAreaIdRef.current) { setMapping(false); return; }
    const areaId = selectedArea?.id || editingAreaIdRef.current;
    if (!areaId || path.length < MIN_AREA_POINTS) return;
    // Ensure closed polygon
    const closed = (path[0][0] === path[path.length-1][0] && path[0][1] === path[path.length-1][1]) ? path : [...path, path[0]];
    const { error } = await supabase.from('land_areas').update({ path: closed }).eq('id', areaId);
    if (error) {
      console.error('Failed to update land area path', error);
      await logActivity('save_mapping', { status: 'failed' });
    } else {
      await logActivity('save_mapping', { status: 'succeeded' });
      await refreshLandAreas();
      // Reopen the view modal for the edited area
      try {
        await openViewLandInfo({ id: areaId });
      } catch {}
    }
    setMapping(false);
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setWalkedPath([]);
  };

  const cancelMapping = () => {
    setMapping(false);
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setWalkedPath([]);
    logActivity('cancel_mapping');
  };

  const resetMapping = () => {
    setPath([]);
    setWalkedPath([]);
    logActivity('reset_mapping');
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

  // Status overlay - Commented out for later use
  /*
  const mappingStatus = mapping && (
    <div style={{ position: 'absolute', top: 70, left: 10, zIndex: 1001, background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <IonText color="primary"><b>Surveying in progress...</b></IonText><br />
      {selectedArea ? (
        <>
          <IonText color="medium" style={{ fontSize: '0.9rem' }}>
            Land Area: {selectedArea.id}
          </IonText><br />
        </>
      ) : null}
      <IonLabel>Markers: {path.length}</IonLabel><br />
      <IonLabel>Distance: {getPathLength(path).toFixed(1)} m</IonLabel>
    </div>
  );
  */

  // In-app directions handler
  const handleGetDirections = (e: any) => {
    if (!selectedArea || !position) return;
    const centroid = getPolygonCentroid(selectedArea.path);
    setDirectionsPopover({ open: true, event: e.nativeEvent });
    fetchRoute(position, centroid);
    logActivity('get_directions');
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
      await logActivity('fetch_route', { status: 'succeeded' });
    } else {
      setRouteCoords([]);
      setRouteInfo(null);
      await logActivity('fetch_route', { status: 'failed' });
    }
  }

  function openGoogleMapsDirections(from: [number, number], to: [number, number]) {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${from[0]},${from[1]}&destination=${to[0]},${to[1]}&travelmode=driving`;
    window.open(url, '_blank');
    logActivity('open_google_maps');
  }

  // Mapping controls (only visible during mapping)
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
  ) : null;

  // Use an inline SVG for the location-outline icon in white
  const locationOutlineSVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512' width='28' height='28' style='display:block'><path fill='none' stroke='white' stroke-width='32' stroke-linecap='round' stroke-linejoin='round' d='M256 48v416M400 256H112'/></svg>`;

  // Use a simple white circle for saved area vertices
  const whiteCircleHTML = `<div style='width:18px;height:18px;border-radius:50%;background:#FFD700;border:2px solid #2E7D32;box-shadow:0 0 4px #0003;'></div>`;

  // After successful edit or delete, refresh tasks and land areas
  const refreshLandAreas = async () => {
    if (!currentUserId) return;
    
    const { data, error } = await supabase
      .from('assigned_polygons')
      .select('task_id, assigned_to, land_area_id, path')
      .eq('assigned_to', currentUserId);
    if (error) {
      console.error('Refresh - assigned_polygons error:', error);
      return;
    }
    setTasks(data || []);
    const polygons = (data || [])
      .map((r: any) => ({ id: r.land_area_id, path: normalizePathToLatLngArray(r.path) }))
      .filter((a: any) => Array.isArray(a.path) && a.path.length >= 3);
    setLandAreas(polygons);
  };

  // Camera capture function with EXIF extraction and image storage
  const captureLandImage = async () => {
    try {
      await logActivity('capture_image');
      // Check if the current land area already has an image
      const areaId = viewFields.areaId || editFields.areaId || selectedArea?.id;
      if (!areaId) {
        alert('Please select a land area first.');
        return;
      }

      // Check for existing image
      const { data: existingData } = await supabase
        .from('land_areas')
        .select('land_image_url, exif_data')
        .eq('id', areaId)
        .single();

      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });

      if (image.webPath) {
        setCapturedImage(image.webPath);

        // Fetch the image blob to extract EXIF data
        const response = await fetch(image.webPath);
        const blob = await response.blob();

        // Extract EXIF data using exifr
        const exif = await exifr.parse(blob, true);

        // Format EXIF data for storage and display
        const formattedExif = {
          latitude: exif?.latitude || null,
          longitude: exif?.longitude || null,
          altitude: exif?.altitude || null,
          make: exif?.Make || null,
          model: exif?.Model || null,
          dateTime: exif?.DateTimeOriginal || exif?.DateTime || null,
          software: exif?.Software || null,
          orientation: exif?.Orientation || null,
          exposureTime: exif?.ExposureTime || null,
          fNumber: exif?.FNumber || null,
          iso: exif?.ISO || null,
          focalLength: exif?.FocalLength || null,
          flash: exif?.Flash || null,
          whiteBalance: exif?.WhiteBalance || null,
          imageWidth: exif?.ImageWidth || null,
          imageHeight: exif?.ImageHeight || null,
        };

        setExifData(formattedExif);
        await logActivity('extract_exif', { status: 'succeeded' });

        // Check if image already exists
        if (existingData?.land_image_url) {
          // Store pending data and ask for confirmation
          setPendingImageData({ image: image.webPath, exif: formattedExif });
          setShowImageUpdateConfirm(true);
        } else {
          // No existing image, proceed directly
          setShowImageModal(true);
        }
      }
    } catch (error) {
      console.error('Error capturing image:', error);
      alert('Failed to capture image. Please try again.');
      await logActivity('capture_image', { status: 'failed' });
    }
  };

  // Save image and EXIF data to land area
  const saveImageToLandArea = async (areaId: string, shouldUpdate: boolean = false) => {
    if (!capturedImage || !exifData) return;

    try {
      // Fetch the image blob
      const response = await fetch(capturedImage);
      const blob = await response.blob();

      // Generate unique filename
      const fileName = `land-${areaId}-${Date.now()}.jpg`;
      const filePath = `land-images/${fileName}`;

      // If updating, delete old image first
      if (shouldUpdate) {
        const { data: existingData } = await supabase
          .from('land_areas')
          .select('land_image_url')
          .eq('id', areaId)
          .single();

        if (existingData?.land_image_url) {
          // Extract file path from URL
          const oldPath = existingData.land_image_url.split('/').slice(-2).join('/');
          await supabase.storage.from('land-area-images').remove([oldPath]);
        }
      }

      // Upload image to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('land-area-images')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        alert('Failed to upload image. Please try again.');
        await logActivity('upload_image', { status: 'failed' });
        return;
      }
      await logActivity('upload_image', { status: 'succeeded' });

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('land-area-images')
        .getPublicUrl(filePath);

      // Update database with image URL and EXIF data
      const { error: dbError } = await supabase
        .from('land_areas')
        .update({ 
          land_image_url: urlData.publicUrl,
          exif_data: exifData 
        })
        .eq('id', areaId);

      if (dbError) {
        console.error('Failed to save to database:', dbError);
        alert('Failed to save image data.');
        await logActivity('save_image_record', { status: 'failed' });
        return;
      }
      await logActivity('save_image_record', { status: 'succeeded' });

      setShowImageModal(false);
      setShowImageUpdateConfirm(false);
      setPendingImageData(null);
      setCapturedImage(null);
      setExifData(null);
      await refreshLandAreas();
      // Reopen the view modal to show updated data
      await openViewLandInfo({ id: areaId });
    } catch (error) {
      console.error('Error saving image:', error);
      alert('Failed to save image. Please try again.');
      await logActivity('save_image', { status: 'failed' });
    }
  };

  // When opening View Land Info or Edit Land Info, fetch info from land_areas by id
  const openViewLandInfo = async (area: any) => {
    // First try with all columns including new ones
    let { data: la, error } = await supabase
      .from('land_areas')
      .select('id, lhid, lo_name, moa, created_at, title_number, survey_number, lot_number, barangay_name, total_area, current_status, current_status_desc, problem_category, sub_category, remarks, exif_data, land_image_url')
      .eq('id', area.id)
      .single();
    
    // If that fails, try without the new columns (in case they don't exist yet)
    if (error && error.code === 'PGRST116') {
      const fallbackResult = await supabase
        .from('land_areas')
        .select('id, lhid, lo_name, moa, created_at, title_number, survey_number, lot_number, barangay_name, total_area, current_status, current_status_desc, problem_category, sub_category, remarks')
        .eq('id', area.id)
        .single();
      if (fallbackResult.data) {
        la = { ...fallbackResult.data, exif_data: null, land_image_url: null };
        error = fallbackResult.error;
      }
    }
    
    if (la && !error) {
      setSelectedArea(area);
      setViewFields({
        areaId: la.id,
        createdAt: la.created_at || '',
        lhid: la.lhid || '',
        ownerName: la.lo_name || '',
        moa: la.moa || '',
        titleNumber: la.title_number || '',
        surveyNumber: la.survey_number || '',
        lotNumber: la.lot_number || '',
        barangay: la.barangay_name || '',
        totalArea: la.total_area || '',
        status: la.current_status || '',
        statusDesc: la.current_status_desc || '',
        problemCategory: la.problem_category || '',
        subCategory: la.sub_category || '',
        remarks: la.remarks || '',
        exifData: la.exif_data || null,
        landImageUrl: la.land_image_url || null
      });
      setEditFields({
        areaId: la.id,
        lhid: la.lhid || '',
        ownerName: la.lo_name || '',
        moa: la.moa || '',
        titleNumber: la.title_number || '',
        surveyNumber: la.survey_number || '',
        lotNumber: la.lot_number || '',
        barangay: la.barangay_name || '',
        totalArea: la.total_area || '',
        status: la.current_status || '',
        statusDesc: la.current_status_desc || '',
        problemCategory: la.problem_category || '',
        subCategory: la.sub_category || '',
        remarks: la.remarks || ''
      });
      setViewEditMode(false);
      setShowViewModal(true);
    } else {
      console.error('Failed to fetch land area data:', error);
      alert('Failed to load land area information. Please try again.');
    }
  };
  const openEditLandInfo = async (area: any) => {
    const { data: la, error } = await supabase
      .from('land_areas')
      .select('id, lhid, lo_name, moa, path, title_number, survey_number, lot_number, barangay_name, total_area, current_status, current_status_desc, problem_category, sub_category, remarks')
      .eq('id', area.id)
      .single();
    if (la && !error) {
      setEditFields({
        areaId: la.id,
        path: la.path,
        lhid: la.lhid || '',
        ownerName: la.lo_name || '',
        moa: la.moa || '',
        titleNumber: la.title_number || '',
        surveyNumber: la.survey_number || '',
        lotNumber: la.lot_number || '',
        barangay: la.barangay_name || '',
        totalArea: la.total_area || '',
        status: la.current_status || '',
        statusDesc: la.current_status_desc || '',
        problemCategory: la.problem_category || '',
        subCategory: la.sub_category || '',
        remarks: la.remarks || ''
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

  const ENABLE_POLLING = true; // enable light polling
  const ENABLE_REALTIME = true; // enable realtime updates
  // Polling: refresh land areas every 8 seconds, only when no modal/popover is open
  React.useEffect(() => {
    if (!ENABLE_POLLING) return;
    const isAnyModalOpen = showOwnerModal || showEditModal || showViewModal || showPasswordPrompt || showDeleteConfirm || showDeletePasswordPrompt || (areaPopover && areaPopover.open);
    if (isAnyModalOpen) return;
    const interval = setInterval(() => {
      refreshLandAreas();
    }, 8000);
    return () => clearInterval(interval);
  }, [showOwnerModal, showEditModal, showViewModal, showPasswordPrompt, showDeleteConfirm, showDeletePasswordPrompt, areaPopover]);

  // Refresh when tab becomes visible
  React.useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') refreshLandAreas(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Close any open land info/modal when the side menu is opening (covers swipe gestures)
  React.useEffect(() => {
    const handler = () => {
      try {
        setSelectedArea(null);
        setShowViewModal(false);
        setDirections(null);
        setRouteCoords([]);
        setRouteInfo(null);
        setDirectionsPopover(null);
      } catch {}
    };
    const menus = Array.from(document.querySelectorAll('ion-menu')) as any[];
    menus.forEach((m) => {
      try {
        m.addEventListener('ionWillOpen', handler);
      } catch {}
    });
    return () => {
      menus.forEach((m) => {
        try { m.removeEventListener('ionWillOpen', handler); } catch {}
      });
    };
  }, []);

  // Supabase Realtime: subscribe to tasks and land_areas changes, only when no modal/popover is open
  React.useEffect(() => {
    if (!ENABLE_REALTIME) return;
    const isAnyModalOpen = showOwnerModal || showEditModal || showViewModal || showPasswordPrompt || showDeleteConfirm || showDeletePasswordPrompt || (areaPopover && areaPopover.open);
    if (isAnyModalOpen) return;
    
    const tasksChannel = supabase
      .channel('realtime:tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        refreshLandAreas();
      })
      .subscribe();
      
    const landAreasChannel = supabase
      .channel('realtime:land_areas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'land_areas' }, () => {
        refreshLandAreas();
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(landAreasChannel);
    };
  }, [showOwnerModal, showEditModal, showViewModal, showPasswordPrompt, showDeleteConfirm, showDeletePasswordPrompt, areaPopover]);

  return (
    <IonPage>
      <IonHeader style={{ background: 'linear-gradient(135deg, #2E7D32 0%, #388E3C 100%)' }}>
        <IonToolbar style={{ background: 'transparent' }}>
          <IonTitle style={{ display: 'flex', alignItems: 'center', fontWeight: 700, fontSize: '1.05rem', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#FFD700' }}>
            <IonIcon icon={castleIcon} style={{ marginRight: 6, fontSize: '1.2rem', color: '#FFD700' }} />
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
          <IonFabButton color="success" onClick={async () => {
            // Close any open modals/popovers before opening the menu to avoid stray UI
            try {
              setSelectedArea(null);
              setShowViewModal(false);
              setDirections(null);
              setRouteCoords([]);
              setRouteInfo(null);
              setDirectionsPopover(null);
            } catch {}
            const menu = document.querySelector('ion-menu') as any;
            if (menu && typeof menu.open === 'function') {
              try { await menu.open(); } catch {}
            }
          }} style={{ background: 'linear-gradient(135deg, #2E7D32 0%, #388E3C 100%)' }}> 
            <IonIcon icon={menuIcon} style={{ color: '#FFD700' }} />
          </IonFabButton>
        </IonFab>
        {/* Status overlay - Commented out for later use */}
        {/*
        {mappingStatus}
        */}
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
              {!mapping && landAreas.map((area, idx) => (
                <React.Fragment key={`poly-${idx}`}>
                  <Polygon
                    positions={area.path}
                    pathOptions={{
                      color: area.user_id === currentUserId ? '#2E7D32' : '#388E3C',
                      fillColor: area.user_id === currentUserId ? '#2E7D32' : '#388E3C',
                      fillOpacity: 0.5,
                      weight: 4
                    }}
                    eventHandlers={{ click: (e: any) => setAreaPopover({ open: true, event: e.originalEvent, area }) }}
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
                  {/* Add label for assigned land areas */}
                  {area.user_id === currentUserId && (
                    <Marker
                      position={getPolygonCentroid(area.path)}
                      icon={L.divIcon({
                        className: '',
                        html: `<div style='background: rgba(46, 125, 50, 0.9); color: #FFD700; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; white-space: nowrap;'>Assigned for Surveying</div>`,
                        iconSize: [150, 30],
                        iconAnchor: [75, 15],
                      })}
                      interactive={false}
                    />
                  )}
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
        <IonModal isOpen={showOwnerModal} onDidDismiss={() => {
  setShowOwnerModal(false);
  setOwnerName('');
  setPath([]);
  setMapping(false);
}}>
  <div style={{ maxWidth: 340, margin: '0 auto', background: 'var(--dar-white)', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: 32, textAlign: 'center' }}>
    <IonText className="dar-title" style={{ fontSize: '1.3rem', color: 'var(--dar-green)', fontWeight: 700, marginBottom: 12 }}>
      {selectedArea && selectedArea.id ? 'Complete Surveying' : 'Enter Land Owner\'s Name'}
    </IonText>
    <div className="dar-divider" style={{ margin: '16px 0' }}></div>
    {!selectedArea || !selectedArea.id ? (
    <IonInput className="dar-input" label="Owner's Name" labelPlacement="floating" value={ownerName} onIonChange={e => setOwnerName(e.detail.value!)} placeholder="Owner's Name" style={{ margin: '16px 0', fontSize: '1.1rem' }} />
    ) : (
      <IonText style={{ margin: '16px 0', fontSize: '1.1rem', color: 'var(--dar-medium)' }}>
        Surveying land area {selectedArea.id}
      </IonText>
    )}
    <IonButton className="dar-btn" expand="block" style={{ marginTop: 24 }} onClick={() => {
      // saveLandArea(); // Commented out for later use
    }} disabled={!selectedArea?.id && !ownerName}>
      {selectedArea && selectedArea.id ? 'Save Survey' : 'Save'}
    </IonButton>
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
          message={selectedArea && selectedArea.id ? 'Survey completed successfully!' : 'Land area saved!'}
          duration={1500}
          position="top"
          color={'success'}
        />
        {/* Modal for area details */}
        <IonModal isOpen={showViewModal} onDidDismiss={() => { setShowViewModal(false); setSelectedArea(null); setDirections(null); setRouteCoords([]); setRouteInfo(null); setDirectionsPopover(null); }}>
          <div style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 16, background: 'linear-gradient(135deg, #2E7D32 0%, #388E3C 100%)', color: '#FFD700', borderTopLeftRadius: 8, borderTopRightRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontWeight: 700 }}>Land Information</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {viewFields.status && (
                  <span style={{ background: '#1b5e20', color: '#FFD700', padding: '4px 8px', borderRadius: 12, fontSize: 12 }}>{viewFields.status}</span>
                )}
                {viewFields.problemCategory && (
                  <span style={{ background: '#33691e', color: '#FFD700', padding: '4px 8px', borderRadius: 12, fontSize: 12 }}>{viewFields.problemCategory}</span>
                )}
                <IonButton size="small" fill="clear" color="light" onClick={() => setSelectedArea(null)}>Close</IonButton>
              </div>
            </div>
            <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
              {!viewEditMode ? (
                <>
                  {/* Land Image Display */}
                  {viewFields.landImageUrl && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#2E7D32', marginBottom: 8 }}>Land Image</div>
                      <img 
                        src={viewFields.landImageUrl} 
                        alt="Land" 
                        style={{ 
                          width: '100%', 
                          maxHeight: 200, 
                          objectFit: 'contain', 
                          borderRadius: 8, 
                          border: '2px solid #2E7D32',
                          cursor: 'pointer'
                        }}
                        onClick={() => window.open(viewFields.landImageUrl, '_blank')}
                      />
                      <div style={{ fontSize: 12, color: '#666', marginTop: 4, textAlign: 'center' }}>Click image to view full size</div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><div style={{ fontSize: 12, color: '#666' }}>LHID</div><div style={{ fontWeight: 600 }}>{viewFields.lhid || '-'}</div></div>
                  <div><div style={{ fontSize: 12, color: '#666' }}>Owner</div><div style={{ fontWeight: 600 }}>{viewFields.ownerName || '-'}</div></div>
                  <div><div style={{ fontSize: 12, color: '#666' }}>MOA</div><div style={{ fontWeight: 600 }}>{viewFields.moa || '-'}</div></div>
                  <div><div style={{ fontSize: 12, color: '#666' }}>Title #</div><div style={{ fontWeight: 600 }}>{viewFields.titleNumber || '-'}</div></div>
                  <div><div style={{ fontSize: 12, color: '#666' }}>Survey #</div><div style={{ fontWeight: 600 }}>{viewFields.surveyNumber || '-'}</div></div>
                  <div><div style={{ fontSize: 12, color: '#666' }}>Lot #</div><div style={{ fontWeight: 600 }}>{viewFields.lotNumber || '-'}</div></div>
                  <div><div style={{ fontSize: 12, color: '#666' }}>Barangay</div><div style={{ fontWeight: 600 }}>{viewFields.barangay || '-'}</div></div>
                  <div><div style={{ fontSize: 12, color: '#666' }}>Total Area</div><div style={{ fontWeight: 600 }}>{viewFields.totalArea || '-'}</div></div>
                  <div style={{ gridColumn: '1 / span 2' }}><div style={{ fontSize: 12, color: '#666' }}>Status Desc</div><div style={{ fontWeight: 600 }}>{viewFields.statusDesc || '-'}</div></div>
                  <div style={{ gridColumn: '1 / span 2' }}><div style={{ fontSize: 12, color: '#666' }}>Remarks</div><div style={{ fontWeight: 600 }}>{viewFields.remarks || '-'}</div></div>
                  {viewFields.createdAt && (
                    <div style={{ gridColumn: '1 / span 2', fontSize: 12, color: '#666' }}>Added At: {new Date(viewFields.createdAt).toLocaleString()}</div>
                  )}
                  {viewFields.exifData && (
                    <div style={{ gridColumn: '1 / span 2', marginTop: 12, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#2E7D32', marginBottom: 8 }}>Image Metadata</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                        {viewFields.exifData.latitude && (
                          <div><span style={{ color: '#666' }}>GPS Lat:</span> <span style={{ fontWeight: 600 }}>{viewFields.exifData.latitude.toFixed(6)}</span></div>
                        )}
                        {viewFields.exifData.longitude && (
                          <div><span style={{ color: '#666' }}>GPS Lng:</span> <span style={{ fontWeight: 600 }}>{viewFields.exifData.longitude.toFixed(6)}</span></div>
                        )}
                        {viewFields.exifData.altitude && (
                          <div><span style={{ color: '#666' }}>Altitude:</span> <span style={{ fontWeight: 600 }}>{viewFields.exifData.altitude.toFixed(2)}m</span></div>
                        )}
                        {viewFields.exifData.dateTime && (
                          <div><span style={{ color: '#666' }}>Date:</span> <span style={{ fontWeight: 600 }}>{new Date(viewFields.exifData.dateTime).toLocaleDateString()}</span></div>
                        )}
                        {viewFields.exifData.make && (
                          <div><span style={{ color: '#666' }}>Camera:</span> <span style={{ fontWeight: 600 }}>{viewFields.exifData.make}</span></div>
                        )}
                        {viewFields.exifData.model && (
                          <div><span style={{ color: '#666' }}>Model:</span> <span style={{ fontWeight: 600 }}>{viewFields.exifData.model}</span></div>
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                </>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <IonInput label="LHID" labelPlacement="stacked" value={editFields.lhid} onIonChange={e => setEditFields((p: any) => ({ ...p, lhid: e.detail.value! }))} />
                  <IonInput label="Owner" labelPlacement="stacked" value={editFields.ownerName} onIonChange={e => setEditFields((p: any) => ({ ...p, ownerName: e.detail.value! }))} />
                  <IonInput label="MOA" labelPlacement="stacked" value={editFields.moa} onIonChange={e => setEditFields((p: any) => ({ ...p, moa: e.detail.value! }))} />
                  <IonInput label="Title #" labelPlacement="stacked" value={editFields.titleNumber} onIonChange={e => setEditFields((p: any) => ({ ...p, titleNumber: e.detail.value! }))} />
                  <IonInput label="Survey #" labelPlacement="stacked" value={editFields.surveyNumber} onIonChange={e => setEditFields((p: any) => ({ ...p, surveyNumber: e.detail.value! }))} />
                  <IonInput label="Lot #" labelPlacement="stacked" value={editFields.lotNumber} onIonChange={e => setEditFields((p: any) => ({ ...p, lotNumber: e.detail.value! }))} />
                  <IonInput label="Barangay" labelPlacement="stacked" value={editFields.barangay} onIonChange={e => setEditFields((p: any) => ({ ...p, barangay: e.detail.value! }))} />
                  <IonInput label="Total Area" labelPlacement="stacked" value={editFields.totalArea} inputmode="decimal" onIonChange={e => setEditFields((p: any) => ({ ...p, totalArea: e.detail.value! }))} />
                  <IonInput label="Status" labelPlacement="stacked" value={editFields.status} onIonChange={e => setEditFields((p: any) => ({ ...p, status: e.detail.value! }))} />
                  <IonInput label="Status Desc" labelPlacement="stacked" value={editFields.statusDesc} onIonChange={e => setEditFields((p: any) => ({ ...p, statusDesc: e.detail.value! }))} />
                  <IonInput label="Problem Category" labelPlacement="stacked" value={editFields.problemCategory} onIonChange={e => setEditFields((p: any) => ({ ...p, problemCategory: e.detail.value! }))} />
                  <IonInput label="Sub Category" labelPlacement="stacked" value={editFields.subCategory} onIonChange={e => setEditFields((p: any) => ({ ...p, subCategory: e.detail.value! }))} />
                  <IonInput label="Remarks" labelPlacement="stacked" value={editFields.remarks} onIonChange={e => setEditFields((p: any) => ({ ...p, remarks: e.detail.value! }))} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <IonButton color="success" onClick={() => { if (viewFields.areaId) { startUpdatePoints({ id: viewFields.areaId, path: [] }); } }}>Update Points</IonButton>
                  <IonButton color="warning" onClick={captureLandImage}>
                    <IonIcon icon={cameraIcon} slot="start" />
                    Capture Land Image
                  </IonButton>
                 {position && (
                    <IonButton color="tertiary" onClick={() => {
                      const area = landAreas.find(a => a.id === (viewFields.areaId || editFields.areaId));
                      const dest = area ? getPolygonCentroid(area.path) : null;
                      if (dest) {
                        openGoogleMapsDirections(position, dest);
                      }
                    }}>Directions</IonButton>
                 )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <IonButton color="medium" onClick={() => setViewEditMode(!viewEditMode)}>{viewEditMode ? 'Cancel Edit' : 'Edit'}</IonButton>
                  <IonButton color="primary" disabled={!viewEditMode} onClick={async () => {
                    if (!viewEditMode) return;
                    const areaId = viewFields.areaId || editFields.areaId;
                    if (!areaId) return;
                    const { error } = await supabase.from('land_areas').update({
                      lhid: editFields.lhid ?? null,
                      lo_name: editFields.ownerName ?? null,
                      moa: editFields.moa ?? null,
                      title_number: editFields.titleNumber ?? null,
                      survey_number: editFields.surveyNumber ?? null,
                      lot_number: editFields.lotNumber ?? null,
                      barangay_name: editFields.barangay ?? null,
                      total_area: editFields.totalArea ?? null,
                      current_status: editFields.status ?? null,
                      current_status_desc: editFields.statusDesc ?? null,
                      problem_category: editFields.problemCategory ?? null,
                      sub_category: editFields.subCategory ?? null,
                      remarks: editFields.remarks ?? null,
                    }).eq('id', areaId);
                    if (!error) {
                      setViewEditMode(false);
                      await refreshLandAreas();
                    }
                  }}>Save</IonButton>
                 <IonButton color="danger" onClick={async () => {
                   const areaId = viewFields.areaId || editFields.areaId;
                   if (!areaId || !currentUserId) return;
                   // Mark task done by removing it from tasks for this user and land area
                   const { error } = await supabase
                     .from('tasks')
                     .update({ status: 'done', updated_at: new Date().toISOString() })
                     .match({ assigned_to: currentUserId, land_area_id: areaId });

                   if (!error) {
                     await refreshLandAreas();
                     setSelectedArea(null);
                   } else {
                     console.error('Mark done failed:', error);
                   }
                 }}>Task Done</IonButton>
                </div>
              </div>
            </div>
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
          <div style={{ padding: 8 }}>
            <IonList className="dar-list" style={{ minWidth: 240, padding: 0, background: '#1f1f1f', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
              <IonItem className="dar-list-item" button detail={false} style={{ '--min-height': '46px', '--background': 'transparent', '--color': '#fff' }} onClick={() => {
              openViewLandInfo(areaPopover?.area);
              setAreaPopover(null);
            }}>
                <IonIcon icon={eyeOutline} slot="start" style={{ color: '#FFD700' }} />
                <span style={{ fontWeight: 600 }}>View Land Info</span>
            </IonItem>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 12px' }} />
              <IonItem className="dar-list-item" button detail={false} style={{ '--min-height': '46px', '--background': 'transparent', '--color': '#fff' }} onClick={() => setAreaPopover(null)}>
                <IonIcon icon={closeIcon} slot="start" style={{ color: '#bbb' }} />
                <span style={{ fontWeight: 600 }}>Nevermind</span>
            </IonItem>
          </IonList>
          </div>
        </IonPopover>
        <IonModal isOpen={showEditModal} onDidDismiss={() => { setShowEditModal(false); setEditPassword(''); setEditError(''); }}>
  <div style={{ maxWidth: 340, margin: '0 auto', background: 'var(--dar-white)', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: 32, textAlign: 'center' }}>
    <IonText className="dar-title" style={{ fontSize: '1.3rem', color: 'var(--dar-green)', fontWeight: 700, marginBottom: 12 }}>Edit Land Info</IonText>
    <div className="dar-divider" style={{ margin: '16px 0' }}></div>
    <IonInput className="dar-input" label="Owner's Name" labelPlacement="floating" value={editFields.ownerName} onIonChange={e => setEditFields((prev: any) => ({ ...prev, ownerName: e.detail.value! }))} placeholder="Owner's Name" style={{ margin: '16px 0', fontSize: '1.1rem' }} />
    {editError && <IonText color="danger"><div style={{ margin: '8px 0' }}>{editError}</div></IonText>}
    <IonButton className="dar-btn" expand="block" style={{ marginTop: 24 }} onClick={() => setShowPasswordPrompt(true)}>Save</IonButton>
    <IonButton className="dar-btn" expand="block" color="medium" style={{ marginTop: 8 }} onClick={() => { setShowEditModal(false); setEditPassword(''); setEditError(''); }}>Cancel</IonButton>
  </div>
</IonModal>
        <IonModal isOpen={showPasswordPrompt} onDidDismiss={() => { setShowPasswordPrompt(false); setEditPassword(''); setEditError(''); }}>
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
              // Update land_areas with edited fields
              if (editFields.areaId) {
                const { error: landError } = await supabase.from('land_areas').update({
                  lo_name: editFields.ownerName,
                  path: editFields.path,
                  title_number: editFields.titleNumber,
                  survey_number: editFields.surveyNumber,
                  lot_number: editFields.lotNumber,
                  barangay_name: editFields.barangay,
                  total_area: editFields.totalArea,
                  current_status: editFields.status,
                  current_status_desc: editFields.statusDesc,
                  problem_category: editFields.problemCategory,
                  sub_category: editFields.subCategory,
                  remarks: editFields.remarks,
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
        <IonModal isOpen={showDeleteConfirm} onDidDismiss={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }}>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <IonText color="danger"><h2>Delete Land Area?</h2></IonText>
            <div style={{ margin: '16px 0' }}>Are you sure you want to delete this land area? This action cannot be undone.</div>
            <IonButton className="dar-btn" expand="block" color="danger" onClick={() => { setShowDeleteConfirm(false); setShowDeletePasswordPrompt(true); }}>Yes, Delete</IonButton>
            <IonButton className="dar-btn" expand="block" color="medium" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); setDeleteTarget(null); }}>No, Cancel</IonButton>
          </div>
        </IonModal>
        <IonModal isOpen={showDeletePasswordPrompt} onDidDismiss={() => { setShowDeletePasswordPrompt(false); setDeletePassword(''); setDeleteError(''); setDeleteTarget(null); }}>
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
              setShowDeletePasswordPrompt(false);
              setDeletePassword('');
              setDeleteError('');
              setDeleteTarget(null);
              await refreshLandAreas();
            }}>Confirm Delete</IonButton>
            <IonButton className="dar-btn" expand="block" color="medium" onClick={() => { setShowDeletePasswordPrompt(false); setDeletePassword(''); setDeleteError(''); setDeleteTarget(null); }}>Cancel</IonButton>
  </div>
</IonModal>
        {/* Land Image Modal */}
        <IonModal isOpen={showImageModal} onDidDismiss={() => { setShowImageModal(false); setCapturedImage(null); setExifData(null); }}>
          <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
            <IonText><h2 style={{ color: '#2E7D32', marginBottom: 16 }}>Captured Land Image</h2></IonText>
            {capturedImage && (
              <div style={{ marginBottom: 16 }}>
                <img src={capturedImage} alt="Captured" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 8, border: '2px solid #2E7D32' }} />
              </div>
            )}
            {exifData && (
              <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#2E7D32', marginBottom: 12 }}>Image Metadata</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
                  {exifData.latitude && (
                    <div><span style={{ color: '#666' }}>GPS Latitude:</span><br /><span style={{ fontWeight: 600 }}>{exifData.latitude.toFixed(6)}</span></div>
                  )}
                  {exifData.longitude && (
                    <div><span style={{ color: '#666' }}>GPS Longitude:</span><br /><span style={{ fontWeight: 600 }}>{exifData.longitude.toFixed(6)}</span></div>
                  )}
                  {exifData.altitude && (
                    <div><span style={{ color: '#666' }}>Altitude:</span><br /><span style={{ fontWeight: 600 }}>{exifData.altitude.toFixed(2)} meters</span></div>
                  )}
                  {exifData.dateTime && (
                    <div><span style={{ color: '#666' }}>Date/Time:</span><br /><span style={{ fontWeight: 600 }}>{new Date(exifData.dateTime).toLocaleString()}</span></div>
                  )}
                  {exifData.make && (
                    <div><span style={{ color: '#666' }}>Camera Make:</span><br /><span style={{ fontWeight: 600 }}>{exifData.make}</span></div>
                  )}
                  {exifData.model && (
                    <div><span style={{ color: '#666' }}>Camera Model:</span><br /><span style={{ fontWeight: 600 }}>{exifData.model}</span></div>
                  )}
                  {exifData.iso && (
                    <div><span style={{ color: '#666' }}>ISO:</span><br /><span style={{ fontWeight: 600 }}>{exifData.iso}</span></div>
                  )}
                  {exifData.focalLength && (
                    <div><span style={{ color: '#666' }}>Focal Length:</span><br /><span style={{ fontWeight: 600 }}>{exifData.focalLength}mm</span></div>
                  )}
                  {exifData.exposureTime && (
                    <div><span style={{ color: '#666' }}>Exposure:</span><br /><span style={{ fontWeight: 600 }}>{exifData.exposureTime}s</span></div>
                  )}
                  {exifData.fNumber && (
                    <div><span style={{ color: '#666' }}>F-Number:</span><br /><span style={{ fontWeight: 600 }}>f/{exifData.fNumber}</span></div>
                  )}
                  {exifData.imageWidth && exifData.imageHeight && (
                    <div><span style={{ color: '#666' }}>Dimensions:</span><br /><span style={{ fontWeight: 600 }}>{exifData.imageWidth} × {exifData.imageHeight}</span></div>
                  )}
                  {exifData.software && (
                    <div><span style={{ color: '#666' }}>Software:</span><br /><span style={{ fontWeight: 600 }}>{exifData.software}</span></div>
                  )}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <IonButton className="dar-btn" expand="block" color="success" onClick={() => {
                const areaId = viewFields.areaId || editFields.areaId || selectedArea?.id;
                if (areaId) {
                  saveImageToLandArea(areaId, false);
                } else {
                  alert('No land area selected. Please select a land area first.');
                }
              }}>Save Image</IonButton>
              <IonButton className="dar-btn" expand="block" color="medium" onClick={() => { setShowImageModal(false); setCapturedImage(null); setExifData(null); }}>Cancel</IonButton>
            </div>
          </div>
        </IonModal>
        {/* Update Image Confirmation Modal */}
        <IonModal isOpen={showImageUpdateConfirm} onDidDismiss={() => { setShowImageUpdateConfirm(false); setPendingImageData(null); setCapturedImage(null); setExifData(null); }}>
          <div style={{ padding: 24, textAlign: 'center', maxWidth: 400, margin: '0 auto' }}>
            <IonText color="warning"><h2>Image Already Exists</h2></IonText>
            <div style={{ margin: '16px 0', fontSize: 14 }}>
              This land area already has an image. Do you want to replace it with the new image?
            </div>
            {capturedImage && (
              <div style={{ marginBottom: 16 }}>
                <img src={capturedImage} alt="New capture" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, border: '2px solid #FF9800' }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <IonButton className="dar-btn" expand="block" color="warning" onClick={() => {
                const areaId = viewFields.areaId || editFields.areaId || selectedArea?.id;
                if (areaId) {
                  saveImageToLandArea(areaId, true);
                }
              }}>Yes, Replace Image</IonButton>
              <IonButton className="dar-btn" expand="block" color="medium" onClick={() => { setShowImageUpdateConfirm(false); setPendingImageData(null); setCapturedImage(null); setExifData(null); }}>Cancel</IonButton>
            </div>
          </div>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default Home;