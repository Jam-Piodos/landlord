import { 
    IonAlert,
    IonButton,
    IonButtons,
      IonContent, 
      IonHeader, 
      IonIcon, 
      IonItem, 
      IonMenu, 
      IonMenuButton, 
      IonMenuToggle, 
      IonPage, 
      IonRouterOutlet, 
      IonSplitPane, 
      IonTitle, 
      IonToast, 
      IonToolbar, 
      useIonRouter,
      IonLabel,
      IonText,
      IonList,
      IonCard,
      IonCardContent,
      IonCardHeader
  } from '@ionic/react'
  import {homeOutline, logOutOutline, rocketOutline, settingsOutline, clipboardOutline} from 'ionicons/icons';
import { Redirect, Route } from 'react-router';
import Home from './Home';
import About from './About';
import Details from './Details';
import { supabase } from '../utils/supabaseClient';
import { logActivity } from '../utils/logger';
import { useState, useEffect } from 'react';
import EditProfilePage from './EditProfile';


  const Menu: React.FC = () => {
    const navigation = useIonRouter();
    const [showAlert, setShowAlert] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [showToast, setShowToast] = useState(false);
    const [tasks, setTasks] = useState<any[]>([]);
    const [landAreas, setLandAreas] = useState<any[]>([]);
    const [landAreaDetails, setLandAreaDetails] = useState<Record<string, { name: string; status: string }>>({});
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    
    const path = [
        {name:'Home', url: '/landlord/app/home', icon: homeOutline},
        {name:'About', url: '/landlord/app/about', icon: rocketOutline},
        {name:'Profile', url: '/landlord/app/profile', icon: settingsOutline},
    ]

    // Fetch tasks and land areas for the current user
    useEffect(() => {
        const fetchAssignments = async () => {
            const { data: authData } = await supabase.auth.getUser();
            const userEmail = authData?.user?.email;
            let userId: number | null = null;
            
            if (userEmail) {
                const { data: userRow, error: userError } = await supabase
                    .from('users')
                    .select('user_id')
                    .eq('user_email', userEmail)
                    .single();
                if (!userError && userRow?.user_id) {
                    userId = userRow.user_id;
                }
            }
            
            if (userId) {
                // Use the assigned_polygons view so counts match the map
                const { data, error } = await supabase
                    .from('assigned_polygons')
                    .select('task_id, assigned_to, land_area_id, path')
                    .eq('assigned_to', userId);
                if (!error && data) {
                    setTasks(data);
                    // Count unique land areas
                    const uniqueAreaIds = Array.from(new Set(data.map((r: any) => String(r.land_area_id))));
                    setLandAreas(uniqueAreaIds.map((id: string) => ({ id })) as any);

                        // Fetch land area names and statuses for display
                        if (uniqueAreaIds.length > 0) {
                            const { data: laRows, error: laError } = await supabase
                                .from('land_areas')
                                .select('id, lo_name, current_status')
                                .in('id', uniqueAreaIds as any);
                            if (!laError && laRows) {
                                const byId: Record<string, { name: string; status: string }> = {};
                                laRows.forEach((row: any) => {
                                    const isDone = String(row.current_status || '').toLowerCase() === 'done';
                                    byId[String(row.id)] = {
                                        name: row.lo_name || `Land Area ${row.id}`,
                                        status: isDone ? 'Done' : 'Pending'
                                    };
                                });
                                setLandAreaDetails(byId);
                            }
                        }
                }
                setCurrentUserId(userId);
            }
        };
        
        fetchAssignments();
    }, []);

    const handleLogout = async () => {
        const { data: authData } = await supabase.auth.getUser();
        const email = authData?.user?.email || undefined;
        const { error } = await supabase.auth.signOut();
        if (!error) {
            await logActivity('logout', { status: 'succeeded', userName: email });
            setShowToast(true);
            setTimeout(() => {
                navigation.push('/landlord', 'back', 'replace'); 
            }, 300); 
        } else {
            await logActivity('logout', { status: 'failed', userName: email });
            setErrorMessage(error.message);
            setShowAlert(true);
        }
    };

    return (
        <IonPage>
            <IonSplitPane contentId="main">
                <IonMenu className="dar-menu" contentId="main">
                    <IonHeader style={{ background: 'linear-gradient(135deg, #2E7D32 0%, #388E3C 100%)' }}>
                        <IonToolbar style={{ background: 'transparent' }}>
                            <IonTitle className="dar-title" style={{ color: '#FFD700', fontWeight: 700 }}>Menu</IonTitle>
                        </IonToolbar>
                    </IonHeader>
                    <IonContent style={{ background: 'rgba(46, 125, 50, 0.05)', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
                        {path.map((item,index) =>(
                            <IonMenuToggle key={index} className="dar-list-item">
                                <IonItem className="dar-list-item" routerLink={item.url} routerDirection="forward" style={{ '--background': 'rgba(46, 125, 50, 0.1)', '--color': '#2E7D32' }}>
                                    <IonIcon icon={item.icon} slot="start" style={{ color: '#2E7D32' }}></IonIcon>
                                    <span className="dar-label" style={{ color: '#2E7D32' }}>{item.name}</span>
                                </IonItem>
                            </IonMenuToggle>
                        ))}

                        {/* Assignments Section */}
                        {currentUserId && (
                            <div style={{ marginTop: 24, padding: '0 16px' }}>
                                <IonText style={{ color: '#2E7D32', fontWeight: 600, fontSize: '1rem' }}>
                                    <IonIcon icon={clipboardOutline} style={{ marginRight: 8, color: '#2E7D32' }} />
                                    Your Assignments
                                </IonText>
                                
                                {tasks.length > 0 ? (
                                    <div style={{ marginTop: 12 }}>
                                        {tasks.map((task, index) => (
                                            <IonCard 
                                                key={index} 
                                                style={{ 
                                                    marginBottom: 8, 
                                                    background: 'rgba(46, 125, 50, 0.1)', 
                                                    border: '1px solid rgba(46, 125, 50, 0.3)',
                                                    cursor: 'pointer'
                                                }}
                                                onClick={async () => {
                                                    // Store the selected task context for Home
                                                    localStorage.setItem('selectedTask', JSON.stringify(task));
                                                    await logActivity('open_task');
                                                    // Close the side menu before navigating
                                                    const menuEl = document.querySelector('ion-menu') as any;
                                                    if (menuEl && typeof menuEl.close === 'function') {
                                                        try { await menuEl.close(); } catch {}
                                                    }
                                                    // Navigate to home page
                                                    navigation.push('/landlord/app/home', 'forward', 'replace');
                                                }}
                                            >
                                                <IonCardHeader style={{ padding: '12px 16px' }}>
                                                    <IonText style={{ fontSize: '0.9rem', fontWeight: 600, color: '#2E7D32' }}>
                                                        {landAreaDetails[String(task.land_area_id)]?.name || `Land Area ${task.land_area_id}`}
                                                    </IonText>
                                                </IonCardHeader>
                                                <IonCardContent style={{ padding: '0 16px 12px' }} onClick={async () => {
                                                    localStorage.setItem('selectedTask', JSON.stringify(task));
                                                    await logActivity('open_task');
                                                    const menuEl = document.querySelector('ion-menu') as any;
                                                    if (menuEl && typeof menuEl.close === 'function') {
                                                        try { await menuEl.close(); } catch {}
                                                    }
                                                    navigation.push('/landlord/app/home', 'forward', 'replace');
                                                }}>
                                                    <IonText style={{ fontSize: '0.8rem', color: '#2E7D32' }}>
                                                        Status: {landAreaDetails[String(task.land_area_id)]?.status || 'Pending'}
                                                    </IonText>
                                                    <div style={{ marginTop: 4, fontSize: '0.8rem', color: '#388E3C', fontStyle: 'italic' }}>
                                                        Click to start surveying
                                                    </div>
                                                </IonCardContent>
                                            </IonCard>
                                        ))}
                                    </div>
                                ) : (
                                    <IonCard style={{ marginTop: 12, background: 'rgba(46, 125, 50, 0.1)', border: '1px solid rgba(46, 125, 50, 0.3)' }}>
                                        <IonCardHeader style={{ padding: '12px 16px' }}>
                                            <IonText style={{ fontSize: '0.9rem', fontWeight: 600, color: '#2E7D32' }}>
                                                Tasks: 0
                                            </IonText>
                                        </IonCardHeader>
                                        <IonCardContent style={{ padding: '0 16px 12px' }}>
                                            <IonText style={{ fontSize: '0.8rem', color: '#2E7D32' }}>
                                                Land Areas: {landAreas.length}
                                            </IonText>
                                            <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#388E3C', fontStyle: 'italic' }}>
                                                No surveying tasks assigned
                                            </div>
                                        </IonCardContent>
                                    </IonCard>
                                )}
                            </div>
                        )}

                       {/* Logout Button */}
                       <IonButton className="dar-btn" expand="block" onClick={handleLogout} style={{ marginTop: 18, background: 'linear-gradient(135deg, #2E7D32 0%, #388E3C 100%)', color: '#FFD700' }}>
                            <IonIcon icon={logOutOutline} slot="start" style={{ color: '#FFD700' }}></IonIcon>
                            Logout
                        </IonButton>
                        
                    </IonContent>
                </IonMenu>
                
                <IonRouterOutlet id="main">
                    <Route exact path="/landlord/app/home" component={Home} />
                    <Route exact path="/landlord/app/home/details" component={Details} />
                    <Route exact path="/landlord/app/about" component={About} />
                    <Route exact path="/landlord/app/profile" component={EditProfilePage} />

                    <Route exact path="/landlord/app">
                        <Redirect to="/landlord/app/home"/>
                    </Route>
                </IonRouterOutlet>

                {/* IonAlert for displaying login errors */}
                <IonAlert className="dar-toast" isOpen={showAlert} onDidDismiss={() => setShowAlert(false)} header="Logout Failed" message={errorMessage} buttons={['OK']} />
                
                {/* IonToast for success message */}
                <IonToast className="dar-toast" isOpen={showToast} onDidDismiss={() => setShowToast(false)} message="Logout Successful" duration={1500} position="top" color="primary" />

            </IonSplitPane>
        </IonPage>
    );
  };
  
  export default Menu;