import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api } from './api';

// Configure notifications with sound and alert priority
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

// Configure notification sounds
if (Platform.OS === 'ios') {
  Notifications.setNotificationCategoryAsync('medication-reminder', [
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

const SNOOZE_DURATION = 30; // 30 seconds for testing (change to 600 for 10 minutes in production)
const MAX_SNOOZES = 3;
const QUEUE_CHECK_INTERVAL = 30000; // Check queue every 30 seconds

class NotificationQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.checkInterval = null;
  }

  async initialize() {
    // Load existing queue from storage
    try {
      const storedQueue = await AsyncStorage.getItem('notification_queue');
      if (storedQueue) {
        this.queue = JSON.parse(storedQueue);
        // Filter out past notifications
        const now = new Date();
        this.queue = this.queue.filter(item => new Date(item.scheduledTime) > now);
        console.log('Loaded queue from storage:', this.queue);
      }
    } catch (error) {
      console.error('Error loading notification queue:', error);
    }
  }

  async addToQueue(medication, time, isSnooze = false) {
    const scheduledTime = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    
    // Validate time format
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      console.error('Invalid time format:', time);
      return;
    }

    console.log('Parsing time:', {
      input: time,
      hours,
      minutes,
      currentTime: scheduledTime.toLocaleString()
    });

    // Set the time in 24-hour format
    scheduledTime.setHours(hours, minutes, 0, 0);

    // If time has passed for today, schedule for tomorrow
    const now = new Date();
    if (scheduledTime <= now) {
      console.log('Time has passed for today, scheduling for tomorrow');
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const queueItem = {
      medicationId: medication._id,
      userId: medication.user_id,
      name: medication.name,
      time: time,
      scheduledTime: scheduledTime.toISOString(),
      isSnooze,
      snoozeCount: isSnooze ? 1 : 0
    };

    this.queue.push(queueItem);
    await this.saveQueue();
    console.log('Added to queue:', {
      ...queueItem,
      scheduledTime: new Date(queueItem.scheduledTime).toLocaleString(),
      currentTime: now.toLocaleString(),
      timeDifference: Math.round((scheduledTime - now) / 1000 / 60) + ' minutes'
    });
  }

  async addSnoozeToQueue(medication, time, snoozesLeft) {
    const scheduledTime = new Date();
    scheduledTime.setSeconds(scheduledTime.getSeconds() + SNOOZE_DURATION);

    const queueItem = {
      medicationId: medication._id,
      userId: medication.user_id,
      name: medication.name,
      time: time,
      scheduledTime: scheduledTime.toISOString(),
      isSnooze: true,
      snoozeCount: MAX_SNOOZES - snoozesLeft + 1  // Convert from snoozes left to snooze count
    };

    this.queue.push(queueItem);
    await this.saveQueue();
    console.log('Added snooze to queue:', {
      ...queueItem,
      scheduledTime: new Date(queueItem.scheduledTime).toLocaleString(),
      currentTime: new Date().toLocaleString(),
      snoozesLeft: snoozesLeft
    });
  }

  async saveQueue() {
    try {
      await AsyncStorage.setItem('notification_queue', JSON.stringify(this.queue));
    } catch (error) {
      console.error('Error saving notification queue:', error);
    }
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();
      console.log('Processing queue at:', now.toLocaleString());
      console.log('Current queue:', this.queue.map(item => ({
        ...item,
        scheduledTime: new Date(item.scheduledTime).toLocaleString()
      })));

      const dueItems = this.queue.filter(item => {
        const scheduledTime = new Date(item.scheduledTime);
        const isDue = scheduledTime <= now;
        console.log(`Checking item: ${item.name} at ${scheduledTime.toLocaleString()} - Due: ${isDue}`);
        return isDue;
      });

      console.log('Due items:', dueItems.length);

      for (const item of dueItems) {
        // Removing the MAX_SNOOZES check here since we're tracking that elsewhere
        await this.showNotification(item);
        this.queue = this.queue.filter(i => i !== item);
      }

      await this.saveQueue();
    } catch (error) {
      console.error('Error processing notification queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async showNotification(item) {
    try {
      console.log('Showing notification for:', {
        ...item,
        scheduledTime: new Date(item.scheduledTime).toLocaleString(),
        currentTime: new Date().toLocaleString()
      });

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: item.isSnooze ? '🔔 Snoozed Reminder' : '🔔 Medication Reminder',
          body: `Time to take ${item.name}`,
          data: {
            type: 'medication-reminder',
            medicationId: item.medicationId,
            time: item.time,
            name: item.name,
            user_id: item.userId,
            isSnooze: item.isSnooze,
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 250, 250, 250],
          categoryIdentifier: 'medication-reminder',
        },
        trigger: null, // Show immediately
      });

      // Store notification data for snooze tracking
      // If it's a snooze, we need to get the current snoozes left
      const snoozesLeft = item.isSnooze 
        ? MAX_SNOOZES - item.snoozeCount 
        : MAX_SNOOZES;
      
      await NotificationService.storeNotificationData(notificationId, item.medicationId, item.userId, item.time, snoozesLeft);

      console.log('Successfully showed notification:', notificationId);
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  startProcessing() {
    if (this.checkInterval) return;
    this.checkInterval = setInterval(() => this.processQueue(), QUEUE_CHECK_INTERVAL);
    // Process immediately on start
    this.processQueue();
  }

  stopProcessing() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

const notificationQueue = new NotificationQueue();

export const NotificationService = {
  async initialize() {
    await notificationQueue.initialize();
    notificationQueue.startProcessing();
  },

  async scheduleMedicationReminder(medication) {
    if (Platform.OS === 'web') {
      console.log('Notifications are not supported on web platform');
      return false;
    }

    try {
      console.log('Starting to schedule reminders for medication:', JSON.stringify(medication, null, 2));
      const times = medication.times || [];

      for (const time of times) {
        await notificationQueue.addToQueue(medication, time);
      }

      return true;
    } catch (error) {
      console.error('Error scheduling medication reminder:', error);
      return false;
    }
  },

  async snoozeNotification(notificationId) {
    if (Platform.OS === 'web') {
      console.log('Notifications are not supported on web platform');
      return { success: true };
    }

    try {
      console.log('Attempting to snooze notification:', notificationId);
      const notificationData = await this.getNotificationData(notificationId);
      
      if (!notificationData) {
        return { success: false, message: 'Notification data not found' };
      }

      const medication = await api.getMedications(notificationData.userId);
      const currentMed = medication.find((m) => m._id === notificationData.medicationId);

      if (!currentMed) {
        return { success: false, message: 'Medication not found' };
      }

      // Check if we've reached max snoozes
      if (notificationData.snoozesLeft <= 0) {
        return { 
          success: false, 
          message: 'Maximum snoozes reached. Please take your medication or mark it as missed.' 
        };
      }

      // Add snooze to queue with decremented snoozesLeft
      const newSnoozesLeft = notificationData.snoozesLeft - 1;
      await notificationQueue.addSnoozeToQueue(currentMed, notificationData.time, newSnoozesLeft);
      
      // Update snooze count in storage for this notification
      await this.storeNotificationData(
        notificationId, 
        notificationData.medicationId, 
        notificationData.userId, 
        notificationData.time, 
        newSnoozesLeft
      );

      console.log(`Snooze successful, ${newSnoozesLeft} snoozes remaining.`);

      return { 
        success: true,
        message: `Medication snoozed for ${SNOOZE_DURATION} seconds. ${newSnoozesLeft} snoozes remaining.`
      };
    } catch (error) {
      console.error('Error snoozing notification:', error);
      return { success: false, message: error.message };
    }
  },

  // In src/services/notifications.js

  // In src/services/notifications.js
// Add this import at the top if not already present

// Add this function to the NotificationService object
async storeLocalMedicationStatus(medicationId, userId, status) {
  try {
    // Create a key specific to this user
    const statusKey = `medication_statuses_${userId}`;
    
    // Get existing statuses
    const existingStatusesJson = await AsyncStorage.getItem(statusKey);
    const existingStatuses = existingStatusesJson ? JSON.parse(existingStatusesJson) : {};
    
    // Update with new status
    existingStatuses[medicationId] = {
      status,
      updatedAt: new Date().toISOString()
    };
    
    // Save back to storage
    await AsyncStorage.setItem(statusKey, JSON.stringify(existingStatuses));
    
    console.log(`Stored local status for medication ${medicationId}: ${status}`);
    return true;
  } catch (error) {
    console.error('Error storing medication status:', error);
    return false;
  }
},

// Then modify these functions:

  async markMedicationAsTaken(notificationId) {
    if (Platform.OS === 'web') {
      console.log('Notifications are not supported on web platform');
      return { success: true };
    }

    try {
      console.log('Marking medication as taken for notification:', notificationId);
      const notificationData = await this.getNotificationData(notificationId);
      
      if (!notificationData) {
        return { success: false, message: 'Notification data not found' };
      }

      // Store status locally
      await this.storeLocalMedicationStatus(
        notificationData.medicationId,
        notificationData.userId,
        'taken'
      );

      // Remove from queue
      notificationQueue.queue = notificationQueue.queue.filter(
        item => item.medicationId !== notificationData.medicationId || item.time !== notificationData.time
      );
      await notificationQueue.saveQueue();

      return { 
        success: true,
        message: `Medication marked as taken. Next reminder will be at the same time tomorrow.`
      };
    } catch (error) {
      console.error('Error marking medication as taken:', error);
      return { success: false, message: error.message };
    }
  },

  async markMedicationAsMissed(notificationId) {
    if (Platform.OS === 'web') {
      console.log('Notifications are not supported on web platform');
      return { success: true };
    }

    try {
      console.log('Marking medication as missed for notification:', notificationId);
      const notificationData = await this.getNotificationData(notificationId);
      
      if (!notificationData) {
        return { success: false, message: 'Notification data not found' };
      }

      // Store status locally
      await this.storeLocalMedicationStatus(
        notificationData.medicationId,
        notificationData.userId,
        'not_taken'
      );

      // Remove from queue
      notificationQueue.queue = notificationQueue.queue.filter(
        item => item.medicationId !== notificationData.medicationId || item.time !== notificationData.time
      );
      await notificationQueue.saveQueue();

      return { 
        success: true,
        message: `Medication marked as not taken. Next reminder will be at the same time tomorrow.`
      };
    } catch (error) {
      console.error('Error marking medication as missed:', error);
      return { success: false, message: error.message };
    }
  },

  async cancelMedicationNotifications(medicationId, userId) {
    if (Platform.OS === 'web') {
      console.log('Notifications are not supported on web platform');
      return true;
    }

    try {
      notificationQueue.queue = notificationQueue.queue.filter(
        item => !(item.medicationId === medicationId && item.userId === userId)
      );
      await notificationQueue.saveQueue();
      return true;
    } catch (error) {
      console.error('Error canceling medication notifications:', error);
      return false;
    }
  },

  async storeNotificationData(notificationId, medicationId, userId, time, snoozesLeft = MAX_SNOOZES) {
    try {
      const key = `notification_${notificationId}`;
      const data = {
        medicationId,
        userId,
        time,
        snoozesLeft,
        lastSnoozeTime: new Date().toISOString(),
      };
      await AsyncStorage.setItem(key, JSON.stringify(data));
      console.log('Stored notification data:', data);
    } catch (error) {
      console.error('Error storing notification data:', error);
    }
  },

  async getNotificationData(notificationId) {
    try {
      const key = `notification_${notificationId}`;
      const data = await AsyncStorage.getItem(key);
      const parsedData = data ? JSON.parse(data) : null;
      console.log('Retrieved notification data:', parsedData);
      return parsedData;
    } catch (error) {
      console.error('Error getting notification data:', error);
      return null;
    }
  },
};