import { 
    IonButton,
    IonButtons,
      IonContent, 
      IonHeader, 
      IonMenuButton, 
      IonPage, 
      IonTitle, 
      IonToolbar, 
      useIonRouter
  } from '@ionic/react';
  
  const Details: React.FC = () => {
    const navigation = useIonRouter();

    const doDetails = () => {
        navigation.push('/landlord/app','forward','replace');
    }
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Details</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent className='ion-padding'>
            <IonButton onClick={() => doDetails()} expand="full">
                Details
            </IonButton>
        </IonContent>
      </IonPage>
    );
  };
  
  export default Details;