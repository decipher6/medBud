// src/components/WebNotificationHandler.js

import React, { useEffect, useContext } from 'react';
import { Platform } from 'react-native';
import { webNotificationService } from '../services/WebNotificationService';
import { UserContext } from '../../App';

export default function WebNotificationHandler() {
  const { user } = useContext(UserContext);

  useEffect(() => {
    if (Platform.OS === 'web') {
      console.log('Initializing web notification handler');
      
      // Check if browser supports notifications
      if (!("Notification" in window)) {
        console.warn("This browser does not support notifications");
        return;
      }
      
      const initializeNotifications = async () => {
        try {
          // Initialize notification service
          await webNotificationService.initialize();
          
          // Request permission if not granted yet
          if (Notification.permission !== "granted") {
            console.log("Requesting notification permission");
            await Notification.requestPermission();
          } else {
            console.log("Notification permission already granted");
            
            // Test notification for debugging (only in development)
            if (process.env.NODE_ENV === 'development') {
              setTimeout(() => {
                testNotification();
              }, 2000);
            }
          }
        } catch (error) {
          console.error('Error initializing web notifications:', error);
        }
      };
      
      initializeNotifications();
    }
    
    return () => {
      // No cleanup needed
    };
  }, [user]); // Re-run when user changes (login/logout)

  // Test notification function
  const testNotification = () => {
    if (Platform.OS === 'web' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        console.log('Creating test notification');
        try {
          const notification = new Notification('MedBud Test Notification', {
            body: 'Web notifications are now working correctly!',
            icon: '../../assets/logo.png'
          });
          
          notification.onclick = () => {
            console.log('Test notification clicked');
            window.focus();
          };
        } catch (error) {
          console.error('Error showing test notification:', error);
        }
      }
    }
  };

  return null; // This component doesn't render anything
}