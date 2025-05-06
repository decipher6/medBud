import React, { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { NotificationService } from '../services/notifications';
import { useMedication } from '../context/MedicationContext';

export default function NotificationHandler() {
  const { updateMedicationStatus } = useMedication();

  useEffect(() => {
    const setupResult = setupNotifications();
    return () => {
      // Cleanup notification subscription if it was set up
      if (setupResult && setupResult.subscription) {
        setupResult.subscription.remove();
      }
    };
  }, []);

  const setupNotifications = async () => {
    try {
      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Failed to get notification permissions!');
        return;
      }

      // Initialize notification service
      console.log('Initializing notification service...');
      await NotificationService.initialize();
      console.log('Notification service initialized');

      // Configure notification handler
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
        }),
      });

      // Set up notification categories for iOS
      if (Platform.OS === 'ios') {
        await Notifications.setNotificationCategoryAsync('medication-reminder', [
          {
            identifier: 'mark-taken',
            buttonTitle: 'Mark as Taken',
            options: {
              isAuthenticationRequired: false,
              isDestructive: false,
            },
          },
          {
            identifier: 'snooze',
            buttonTitle: 'Snooze (30s)',
            options: {
              isAuthenticationRequired: false,
              isDestructive: false,
            },
          },
          {
            identifier: 'mark-missed',
            buttonTitle: 'Mark as Not Taken',
            options: {
              isAuthenticationRequired: false,
              isDestructive: true,
            },
          },
        ]);
      }

      // Set up notification response handler
      const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
        const { actionId, notification } = response;
        const medicationId = notification.request.content.data.medicationId;
        
        switch (actionId) {
          case 'mark-taken':
            try {
              // Update status in context
              const success = await updateMedicationStatus(medicationId, 'taken');
              if (success) {
                // Store status locally
                await storeLocalMedicationStatus(medicationId, 'taken');
                // Update backend
                await markMedicationAsTaken(medicationId);
              }
            } catch (error) {
              console.error('Error marking medication as taken:', error);
            }
            break;
          case 'mark-missed':
            try {
              // Update status in context
              const success = await updateMedicationStatus(medicationId, 'not_taken');
              if (success) {
                // Store status locally
                await storeLocalMedicationStatus(medicationId, 'not_taken');
                // Update backend
                await markMedicationAsMissed(medicationId);
              }
            } catch (error) {
              console.error('Error marking medication as missed:', error);
            }
            break;
          case 'snooze':
          case Notifications.DEFAULT_ACTION_IDENTIFIER + 'snooze': // For better cross-platform support
            const result = await NotificationService.snoozeNotification(notification.request.identifier);
            if (result.success) {
              Alert.alert('Snooze', result.message);
            } else {
              Alert.alert('Error', result.message || 'Failed to snooze medication');
            }
            break;
          default:
            // Handle default tap - show the dialog with options
            console.log('Default tap detected with action:', actionId);
            showMedicationReminderDialog(notification);
            break;
        }
      });

      // Also set up a handler for notifications received while the app is in the foreground
      const foregroundSubscription = Notifications.addNotificationReceivedListener((notification) => {
        console.log('Notification received in foreground:', notification);
        // You can choose to show an in-app alert here instead of relying on the OS notification
      });

      return {
        subscription,
        foregroundSubscription,
      };
    } catch (error) {
      console.error('Error setting up notifications:', error);
      return null;
    }
  };

  const showMedicationReminderDialog = async (notification) => {
    const { data } = notification.request.content;
    
    // Show alert dialog
    Alert.alert(
      'Medication Reminder',
      `Time to take ${data.name}`,
      [
        {
          text: 'Mark as Taken',
          onPress: async () => {
            const result = await NotificationService.markMedicationAsTaken(notification.request.identifier);
            if (result.success) {
              updateMedicationStatus(data.medicationId, 'taken');
              Alert.alert('Medication Status', result.message);
            } else {
              Alert.alert('Error', result.message || 'Failed to mark medication as taken');
            }
          },
        },
        {
          text: 'Snooze (30s)',
          onPress: async () => {
            const result = await NotificationService.snoozeNotification(notification.request.identifier);
            if (result.success) {
              Alert.alert('Snooze', result.message);
            } else {
              Alert.alert('Error', result.message || 'Failed to snooze medication');
            }
          },
        },
        {
          text: 'Mark as Not Taken',
          onPress: async () => {
            const result = await NotificationService.markMedicationAsMissed(notification.request.identifier);
            if (result.success) {
              updateMedicationStatus(data.medicationId, 'not_taken');
              Alert.alert('Medication Status', result.message);
            } else {
              Alert.alert('Error', result.message || 'Failed to mark medication as missed');
            }
          },
          style: 'destructive',
        },
      ],
      { cancelable: false }
    );
  };

  return null;
}