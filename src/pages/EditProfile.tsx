import React, { useState, useRef, useEffect } from 'react';
import {
  IonContent, IonPage, IonInput, IonButton, IonAlert, IonHeader,
  IonBackButton, IonButtons, IonItem, IonText, IonCol, IonGrid,
  IonRow, IonInputPasswordToggle, IonImg, IonAvatar,
} from '@ionic/react';
import { supabase } from '../utils/supabaseClient';
import { useHistory } from 'react-router-dom';
import L from 'leaflet';

const EditAccount: React.FC = () => {
    const [email, setEmail] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [username, setUsername] = useState('');
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [showAlert, setShowAlert] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');
    const history = useHistory();
    const fileInputRef = useRef<HTMLInputElement>(null);
  
    useEffect(() => {
        const fetchSessionAndData = async () => {
          // Fetch the current session
          const { data: session, error: sessionError } = await supabase.auth.getSession();
      
          if (sessionError || !session || !session.session) {
            setAlertMessage('You must be logged in to access this page.');
            setShowAlert(true);
            history.push('/landlord/login'); // Redirect to login if no session is found
            return;
          }
      
          // Fetch user details from Supabase using the session's email
          const { data: user, error: userError } = await supabase
            .from('users')
            .select('user_firstname, user_lastname, user_avatar_url, user_email, username')
            .eq('user_email', session.session.user.email) // Use email from the session
            .single();
      
          if (userError || !user) {
            setAlertMessage('User data not found.');
            setShowAlert(true);
            return;
          }
      
          // Populate form fields with the retrieved data
          setFirstName(user.user_firstname || '');
          setLastName(user.user_lastname || '');
          setAvatarPreview(user.user_avatar_url);
          setEmail(user.user_email);
          setUsername(user.username || '');
        };
      
        fetchSessionAndData();
      }, [history]);
  
    const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
      }
    };
  
    const handleUpdate = async () => {
        if (password !== confirmPassword) {
          setAlertMessage("Passwords don't match.");
          setShowAlert(true);
          return;
        }
      
        // Fetch the current session
        const { data: session, error: sessionError } = await supabase.auth.getSession();
      
        if (sessionError || !session || !session.session) {
          setAlertMessage('Error fetching session or no session available.');
          setShowAlert(true);
          return;
        }
      
        const user = session.session.user;
      
        if (!user.email) {
            setAlertMessage('Error: User email is missing.');
            setShowAlert(true);
            return;
          }
          
          const { error: passwordError } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: currentPassword,
          });
          
      
        if (passwordError) {
          setAlertMessage('Incorrect current password.');
          setShowAlert(true);
          return;
        }
      
        // Handle avatar upload if the avatar file is changed
        let avatarUrl = avatarPreview;
      
        if (avatarFile) {
            const fileExt = avatarFile.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;
          
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('user-avatars')
              .upload(filePath, avatarFile, {
                cacheControl: '3600',
                upsert: true,  // Allows overwriting existing files
              });
          
            if (uploadError) {
              setAlertMessage(`Avatar upload failed: ${uploadError.message}`);
              setShowAlert(true);
              return;
            }
          
            // Retrieve the public URL
            const { data } = supabase.storage.from('user-avatars').getPublicUrl(filePath);
            avatarUrl = data.publicUrl;
          }
          
      
        // Update user data in the users table
        const { error: updateError } = await supabase
          .from('users')
          .update({
            user_firstname: firstName,
            user_lastname: lastName,
            user_avatar_url: avatarUrl,
            username: username,
          })
          .eq('user_email', user.email);
      
        if (updateError) {
          setAlertMessage(updateError.message);
          setShowAlert(true);
          return;
        }
      
        // Update the password if a new password is provided
        if (password) {
          const { error: passwordUpdateError } = await supabase.auth.updateUser({
            password: password,
          });
      
          if (passwordUpdateError) {
            setAlertMessage(passwordUpdateError.message);
            setShowAlert(true);
            return;
          }
        }
      
        setAlertMessage('Account updated successfully!');
        setShowAlert(true);
        history.push('/landlord/app');
      };
      
  
    return (
      <IonPage>
        <IonHeader>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/landlord/app" />
          </IonButtons>
        </IonHeader>
        <IonContent className="ion-padding" style={{ background: 'var(--dar-white)', minHeight: '100vh' }}>
          <IonItem lines="none" className="dar-title" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--dar-green)', margin: '16px 0 8px 0', background: 'none' }}>
            Edit Account
          </IonItem>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--dar-gray)', borderRadius: 18, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: 32, maxWidth: 420, margin: '0 auto' }}>
            <IonAvatar style={{ width: '140px', height: '140px', margin: '0 auto 12px auto', background: 'var(--dar-yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IonImg src={avatarPreview || '/default-avatar.png'} />
            </IonAvatar>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleAvatarChange} />
            <IonButton className="dar-btn" expand="block" onClick={() => fileInputRef.current?.click()} style={{ marginBottom: 18 }}>Upload Avatar</IonButton>
            <IonInput className="dar-input" label="Username" type="text" labelPlacement="floating" fill="outline" placeholder="Enter username" value={username} onIonChange={(e) => setUsername(e.detail.value!)} />
            <IonInput className="dar-input" label="First Name" type="text" labelPlacement="floating" fill="outline" placeholder="Enter First Name" value={firstName} onIonChange={(e) => setFirstName(e.detail.value!)} />
            <IonInput className="dar-input" label="Last Name" type="text" labelPlacement="floating" fill="outline" placeholder="Enter Last Name" value={lastName} onIonChange={(e) => setLastName(e.detail.value!)} />
            <IonInput className="dar-input" label="New Password" type="password" labelPlacement="floating" fill="outline" placeholder="Enter New Password" value={password} onIonChange={(e) => setPassword(e.detail.value!)} >
              <IonInputPasswordToggle slot="end" />
            </IonInput>
            <IonInput className="dar-input" label="Confirm Password" type="password" labelPlacement="floating" fill="outline" placeholder="Confirm New Password" value={confirmPassword} onIonChange={(e) => setConfirmPassword(e.detail.value!)} >
              <IonInputPasswordToggle slot="end" />
            </IonInput>
            <IonInput className="dar-input" label="Current Password" type="password" labelPlacement="floating" fill="outline" placeholder="Enter Current Password to Save Changes" value={currentPassword} onIonChange={(e) => setCurrentPassword(e.detail.value!)} >
              <IonInputPasswordToggle slot="end" />
            </IonInput>
            <IonButton className="dar-btn" expand="block" onClick={handleUpdate} shape="round" style={{ marginTop: 18 }}>Update Account</IonButton>
          </div>
          <IonAlert isOpen={showAlert} onDidDismiss={() => setShowAlert(false)} message={alertMessage} buttons={['OK']} />
        </IonContent>
      </IonPage>
    );
  };
  
  export default EditAccount;