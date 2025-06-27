import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/react';
import { MapContainer, TileLayer, Marker, useMap, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useEffect, useState } from 'react';
import MarkerClusterGroup from 'react-leaflet-markercluster';

const Home: React.FC = () => {
  const [position, setPosition] = useState<[number, number] | null>(null);

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
  }, []);

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
              attribution='Landlord &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
            />
            <Marker position={position} />
            <Circle center={position} radius={10} pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.3 }} />
            <MarkerClusterGroup>
              {position && <Marker position={position} />}
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