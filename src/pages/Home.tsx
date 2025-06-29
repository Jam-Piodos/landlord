import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonFab, IonFabButton, IonIcon, IonPopover, IonList, IonItem, IonSearchbar } from '@ionic/react';
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
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

// Helper to generate a marker icon with avatar overlayed on pin
async function generateMarkerIcon(avatarUrl: string | null, size = 64): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size * 1.33; // pin is taller than wide
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve(DEFAULT_AVATAR);

    // Draw pin
    const pinImg = new window.Image();
    pinImg.crossOrigin = 'anonymous';
    pinImg.src = PIN_IMAGE;
    pinImg.onload = () => {
      ctx.drawImage(pinImg, 0, 0, size, size * 1.33);
      // Draw avatar circle
      const avatarImg = new window.Image();
      avatarImg.crossOrigin = 'anonymous';
      avatarImg.src = avatarUrl || DEFAULT_AVATAR;
      avatarImg.onload = () => {
        // Center avatar in the pin's circle
        const avatarSize = size * 0.6;
        const avatarX = (size - avatarSize) / 2;
        const avatarY = size * 0.23;
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
        resolve(canvas.toDataURL());
      };
      avatarImg.onerror = () => {
        // If avatar fails, use default avatar
        const fallbackImg = new window.Image();
        fallbackImg.crossOrigin = 'anonymous';
        fallbackImg.src = DEFAULT_AVATAR;
        fallbackImg.onload = () => {
          const avatarSize = size * 0.6;
          const avatarX = (size - avatarSize) / 2;
          const avatarY = size * 0.23;
          ctx.save();
          ctx.beginPath();
          ctx.arc(size / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, 2 * Math.PI);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(fallbackImg, avatarX, avatarY, avatarSize, avatarSize);
          ctx.restore();
          resolve(canvas.toDataURL());
        };
        fallbackImg.onerror = () => {
          // If even the default avatar fails, just resolve with a blank
          resolve(DEFAULT_AVATAR);
        };
      };
    };
    pinImg.onerror = () => {
      // If pin image fails, fallback to a solid color background
      ctx.fillStyle = '#d32f2f';
      ctx.beginPath();
      ctx.arc(size / 2, size * 0.7, size / 2, Math.PI, 2 * Math.PI);
      ctx.closePath();
      ctx.fill();
      // Draw avatar as above
      const avatarImg = new window.Image();
      avatarImg.crossOrigin = 'anonymous';
      avatarImg.src = avatarUrl || DEFAULT_AVATAR;
      avatarImg.onload = () => {
        const avatarSize = size * 0.6;
        const avatarX = (size - avatarSize) / 2;
        const avatarY = size * 0.23;
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
        resolve(canvas.toDataURL());
      };
      avatarImg.onerror = () => {
        // If avatar fails, use default avatar
        const fallbackImg = new window.Image();
        fallbackImg.crossOrigin = 'anonymous';
        fallbackImg.src = DEFAULT_AVATAR;
        fallbackImg.onload = () => {
          const avatarSize = size * 0.6;
          const avatarX = (size - avatarSize) / 2;
          const avatarY = size * 0.23;
          ctx.save();
          ctx.beginPath();
          ctx.arc(size / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, 2 * Math.PI);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(fallbackImg, avatarX, avatarY, avatarSize, avatarSize);
          ctx.restore();
          resolve(canvas.toDataURL());
        };
        fallbackImg.onerror = () => {
          resolve(DEFAULT_AVATAR);
        };
      };
    };
  });
}

const Home: React.FC = () => {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [markerIcon, setMarkerIcon] = useState<L.Icon | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverAnchor, setPopoverAnchor] = useState<any>(null);
  const [searchText, setSearchText] = useState('');

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
  }, []);

  // Generate marker icon when avatarUrl changes
  useEffect(() => {
    let isMounted = true;
    generateMarkerIcon(avatarUrl).then((dataUrl) => {
      if (isMounted) {
        setMarkerIcon(
          L.icon({
            iconUrl: dataUrl,
            iconSize: [48, 64],
            iconAnchor: [24, 64],
            popupAnchor: [0, -64],
            className: 'user-avatar-marker',
          })
        );
      }
    });
    return () => {
      isMounted = false;
    };
  }, [avatarUrl]);

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
      // TODO: Implement map land functionality
      alert('Map Land action triggered!');
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
      </IonContent>
    </IonPage>
  );
};

export default Home;