import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/react';
import { MapContainer, TileLayer, Marker, useMap, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useEffect, useState } from 'react';
import MarkerClusterGroup from 'react-leaflet-markercluster';
import L from 'leaflet';
import { supabase } from '../utils/supabaseClient';

const Home: React.FC = () => {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log('Your coordinates:', pos.coords.latitude, pos.coords.longitude);
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

  // Always provide a valid icon, fallback to favicon if no avatar
  const userIcon = L.icon({
    iconUrl: avatarUrl || '/default-avatar.png',
    iconSize: [48, 48],
    iconAnchor: [24, 48],
    popupAnchor: [0, -48],
    className: 'user-avatar-marker',
  });

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Land Mapping</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {position && (
          <MapContainer center={position} zoom={18} style={{ height: '80vh' }}>
            <TileLayer
              url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
              //attribution='Landlord &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
            />
            <Marker position={position} icon={userIcon} />
            <Circle center={position} radius={10} pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.3 }} />
            <MarkerClusterGroup>
              {position && <Marker position={position} icon={userIcon} />}
            </MarkerClusterGroup>
            {/* Polygon drawing will go here */}
          </MapContainer>
        )}
        {!position && <div>Loading map...</div>}
      </IonContent>
    </IonPage>
  );
};

export default Home;