import {
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
  IonCard,
  IonCardHeader,
  IonCardContent
} from '@ionic/react';
import { informationCircleOutline, mapOutline, lockClosedOutline } from 'ionicons/icons';
import { useEffect } from 'react';
import { logActivity } from '../utils/logger';

const About: React.FC = () => {
  useEffect(() => { logActivity('view_about'); }, []);
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot='start'>
            <IonMenuButton></IonMenuButton>
          </IonButtons>
          <IonTitle>About</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen style={{
        '--background': 'linear-gradient(135deg, #f7faf7 0%, #eef7f0 100%)'
      }}>
        <div style={{ padding: 16 }}>
          <IonCard style={{
            border: '1px solid rgba(46,125,50,0.15)',
            background: 'white',
            boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
            borderRadius: 12
          }}>
            <IonCardHeader style={{ padding: '16px 16px 8px' }}>
              <IonText style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2E7D32', fontWeight: 700, fontSize: '1.1rem' }}>
                <IonIcon icon={informationCircleOutline} style={{ color: '#2E7D32' }} />
                System Overview
              </IonText>
            </IonCardHeader>
            <IonCardContent style={{ padding: '8px 16px 16px', color: '#335', lineHeight: 1.6 }}>
              <p style={{ marginTop: 8 }}>
                This application helps field personnel survey and document land areas assigned by the office. It shows your tasks, guides you to parcels, and lets you capture details and images on-site.
              </p>

              <div style={{ marginTop: 16 }}>
                <IonText style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2E7D32', fontWeight: 600 }}>
                  <IonIcon icon={mapOutline} style={{ color: '#2E7D32' }} />
                  Map and Assignments
                </IonText>
                <ul style={{ margin: '8px 0 0 18px' }}>
                  <li>Parcels will only appear on the map when the office assigns them to your account.</li>
                  <li>If no assignments are present, the map will be empty. This is expected behavior.</li>
                  <li>Your assignment cards show each land area’s name and status (Done or Pending).</li>
                </ul>
              </div>

              <div style={{ marginTop: 16 }}>
                <IonText style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2E7D32', fontWeight: 600 }}>
                  <IonIcon icon={lockClosedOutline} style={{ color: '#2E7D32' }} />
                  Professional Use Guidance
                </IonText>
                <ul style={{ margin: '8px 0 0 18px' }}>
                  <li>Ensure you are signed in with the correct office-issued account.</li>
                  <li>Refresh assignments if instructed by the office; newly assigned parcels will then display.</li>
                  <li>Only upload accurate images and data; your submissions become part of the official record.</li>
                </ul>
              </div>

              <p style={{ marginTop: 16, color: '#556' }}>
                Need assistance? Contact your office administrator to confirm your assignment status or to request access to specific parcels.
              </p>
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default About;