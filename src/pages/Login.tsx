import { 
    IonAlert,
    IonAvatar,
    IonButton,
    IonContent, 
    IonIcon, 
    IonInput, 
    IonInputPasswordToggle,  
    IonPage,  
    IonToast,  
    useIonRouter
  } from '@ionic/react';
  import { logoIonic } from 'ionicons/icons';
  import { useState, useEffect, useRef } from 'react';
  import { supabase } from '../utils/supabaseClient';
  import L from 'leaflet';
  
  const AlertBox: React.FC<{ message: string; isOpen: boolean; onClose: () => void }> = ({ message, isOpen, onClose }) => {
    return (
      <IonAlert
        isOpen={isOpen}
        onDidDismiss={onClose}
        header="Notification"
        message={message}
        buttons={['OK']}
      />
    );
  };
  
  const Login: React.FC = () => {
    const navigation = useIonRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [alertMessage, setAlertMessage] = useState('');
    const [showAlert, setShowAlert] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [showInstall, setShowInstall] = useState(false);
    const deferredPrompt = useRef<any>(null);

    useEffect(() => {
      const handler = (e: any) => {
        e.preventDefault();
        deferredPrompt.current = e;
        setShowInstall(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
      if (!deferredPrompt.current) return;
      deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;
      if (outcome === 'accepted') {
        setShowInstall(false);
        deferredPrompt.current = null;
      }
    };
  
      const doLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setAlertMessage(error.message);
      setShowAlert(true);
      return;
    }

    // Check if user account is active
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('active')
      .eq('user_email', email)
      .single();

    if (userError) {
      setAlertMessage('Error checking user status. Please try again.');
      setShowAlert(true);
      return;
    }

    if (!userData?.active) {
      setAlertMessage('Your account has been deactivated. Please contact the administrator.');
      setShowAlert(true);
      // Sign out the user since they shouldn't be logged in
      await supabase.auth.signOut();
      return;
    }

    setShowToast(true); 
    setTimeout(() => {
      navigation.push('/landlord/app', 'forward', 'replace');
    }, 300);
  };
  
    return (
      <IonPage>
        <IonContent className='ion-padding'>
          <div style={{
            display: 'flex',
            flexDirection:'column',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop:'25%'
          }}>
            <IonAvatar
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '150px',
                height: '150px',
                borderRadius: '50%', 
                overflow: 'hidden' 
              }}
            >
              <IonIcon 
                icon={logoIonic}
                color='primary'
                style={{ fontSize: '120px', color: '#6c757d' }} 
              />
            </IonAvatar>
            <h1 style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>USER LOGIN</h1>
            <IonInput
              label="Email" 
              labelPlacement="floating" 
              fill="outline"
              type="email"
              placeholder="Enter Email"
              value={email}
              onIonChange={e => setEmail(e.detail.value!)}
            />
            <IonInput style={{ marginTop:'10px' }}      
              fill="outline"
              type="password"
              placeholder="Password"
              value={password}
              onIonChange={e => setPassword(e.detail.value!)}
            >
              <IonInputPasswordToggle slot="end"></IonInputPasswordToggle>
            </IonInput>
          </div>
          <IonButton onClick={doLogin} expand="full" shape='round'>
            Login
          </IonButton>
          {showInstall && (
            <IonButton expand="full" color="secondary" shape='round' style={{ marginTop: 12 }} onClick={handleInstallClick}>
              Install on mobile phone
            </IonButton>
          )}
  
          {/* Reusable AlertBox Component */}
          <AlertBox message={alertMessage} isOpen={showAlert} onClose={() => setShowAlert(false)} />
  
          {/* IonToast for success message */}
          <IonToast
            isOpen={showToast}
            onDidDismiss={() => setShowToast(false)}
            message="Login successful! Redirecting..."
            duration={1500}
            position="top"
            color="primary"
          />
        </IonContent>
      </IonPage>
    );
  };
  
  export default Login;