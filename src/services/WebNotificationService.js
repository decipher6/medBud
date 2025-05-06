import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
// Constants
const SNOOZE_DURATION = 30; // 30 seconds for testing (change to 600 for 10 minutes in production)
const MAX_SNOOZES = 3;
const NOTIFICATIONS_STORAGE_KEY = 'web_notifications';
const PENDING_NOTIFICATIONS_KEY = 'pending_notifications';
const QUEUE_CHECK_INTERVAL = 10000; // Check every 10 seconds

class WebNotificationQueue {
  constructor() {
    this.queue = [];
    this.checkInterval = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    // Load existing queue from storage
    try {
      const storedQueue = await AsyncStorage.getItem(PENDING_NOTIFICATIONS_KEY);
      if (storedQueue) {
        this.queue = JSON.parse(storedQueue);
        console.log('Loaded notification queue from storage:', this.queue);
        
        // Filter out past notifications
        const now = new Date();
        this.queue = this.queue.filter(item => {
          const scheduledTime = new Date(item.scheduledTime);
          const isValid = scheduledTime > now;
          console.log(`Queue item: ${item.name} at ${scheduledTime.toLocaleString()} - Valid: ${isValid}`);
          return isValid;
        });
        
        await this.saveQueue();
      }
      
      // Start queue processing
      this.startProcessing();
      this.isInitialized = true;
      console.log('WebNotificationQueue initialized');
    } catch (error) {
      console.error('Error loading notification queue:', error);
    }
  }

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
  }

  async saveQueue() {
    try {
      await AsyncStorage.setItem(PENDING_NOTIFICATIONS_KEY, JSON.stringify(this.queue));
      console.log('Saved queue to storage, items:', this.queue.length);
    } catch (error) {
      console.error('Error saving notification queue:', error);
    }
  }

  async addToQueue(medication, time, isSnooze = false) {
    if (Platform.OS !== 'web') {
      console.log('Web notifications are only supported on the web platform');
      return false;
    }
    
    try {
      console.log('Adding to queue:', medication.name, 'time:', time);
      
      // Parse the time string (expecting format like "08:00" or "23:30")
      let [hours, minutes] = [0, 0];
      
      if (time.includes(':')) {
        [hours, minutes] = time.split(':').map(Number);
      } else {
        // Try to handle other formats or set default
        hours = parseInt(time);
        minutes = 0;
      }
      
      // Validate time format
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        console.error('Invalid time format:', time);
        hours = new Date().getHours();
        minutes = new Date().getMinutes() + 1; // Default to 1 minute from now
      }
  
      const scheduledTime = new Date();
      console.log(`Current time: ${scheduledTime.toLocaleTimeString()}`);
      
      // Set the hours and minutes
      scheduledTime.setHours(hours, minutes, 0, 0);
      
      console.log(`After setting time: ${scheduledTime.toLocaleTimeString()}`);
  
      // If time has passed for today, schedule for tomorrow
      const now = new Date();
      if (scheduledTime <= now && !isSnooze) {
        console.log('Time has already passed today, scheduling for tomorrow');
        scheduledTime.setDate(scheduledTime.getDate() + 1);
      }
      
      // For testing - set to a few seconds from now
      if (!isSnooze && process.env.NODE_ENV === 'development') {
        scheduledTime.setTime(now.getTime() + 30000); // 30 seconds from now for testing
        console.log('DEV MODE: Setting notification to 30 seconds from now');
      }
  
      const queueItem = {
        id: `med_${medication._id}_${Date.now()}`,
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
      console.log('Added to queue:', queueItem);
      console.log(`Scheduled for: ${new Date(queueItem.scheduledTime).toLocaleString()}`);
      
      return true;
    } catch (error) {
      console.error('Error adding to notification queue:', error);
      return false;
    }
  }

  async addSnoozeToQueue(medication, time, notificationId, snoozesLeft) {
    const scheduledTime = new Date();
    scheduledTime.setSeconds(scheduledTime.getSeconds() + SNOOZE_DURATION);

    const queueItem = {
      id: `snooze_${notificationId}_${Date.now()}`,
      medicationId: medication._id,
      userId: medication.user_id,
      name: medication.name,
      time: time,
      scheduledTime: scheduledTime.toISOString(),
      isSnooze: true,
      snoozeCount: MAX_SNOOZES - snoozesLeft + 1,
      originalNotificationId: notificationId
    };

    this.queue.push(queueItem);
    await this.saveQueue();
    console.log('Added snooze to queue:', queueItem);
  }

  async processQueue() {
    const now = new Date();
    console.log(`Processing queue at: ${now.toLocaleTimeString()}, Items: ${this.queue.length}`);
    
    if (this.queue.length === 0) {
      return;
    }
    
    const dueItems = this.queue.filter(item => {
      const scheduledTime = new Date(item.scheduledTime);
      const isDue = scheduledTime <= now;
      
      if (isDue) {
        console.log(`Due item found: ${item.name} scheduled for ${scheduledTime.toLocaleTimeString()}`);
      }
      
      return isDue;
    });
  
    console.log(`Found ${dueItems.length} due items`);
  
    for (const item of dueItems) {
      console.log(`Showing notification for ${item.name}`);
      await this.showNotification(item);
      this.queue = this.queue.filter(i => i.id !== item.id);
    }
  
    if (dueItems.length > 0) {
      await this.saveQueue();
    }
  }

  async showNotification(item) {
    if (!("Notification" in window)) {
      console.warn("This browser does not support notifications");
      return;
    }

    // Check permission
    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.warn("Notification permission denied");
        return;
      }
    }

    // Enhanced notification for macOS
    const title = item.isSnooze ? '🔔 Snoozed Reminder' : '🔔 Medication Reminder';
    const options = {
      body: `Time to take ${item.name}`,
      // Use absolute paths for icons, and a simpler path that works in deployment
      icon: '/assets/logo.png', 
      // Add sound and make notification persist on macOS
      requireInteraction: true,  // This makes the notification stay until dismissed
      silent: false,             // Ensures sound is played
      data: {
        medicationId: item.medicationId,
        time: item.time,
        name: item.name,
        userId: item.userId,
        isSnooze: item.isSnooze,
      }
    };

    console.log('Creating notification with options:', options);
    const notification = new Notification(title, options);
    console.log('Notification created');
    
    // Store notification data for tracking
    const snoozesLeft = item.isSnooze ? MAX_SNOOZES - item.snoozeCount : MAX_SNOOZES;
    await WebNotificationService.storeNotificationData(
      item.id,
      item.medicationId, 
      item.userId, 
      item.time, 
      snoozesLeft
    );

    // Add click handler
    notification.onclick = function() {
      console.log('Notification clicked');
      // Focus on window when notification is clicked
      window.focus();
      
      // Show actions dialog
      WebNotificationService.showActionsDialog(
        item.id, 
        item.name,
        item.medicationId,
        item.userId,
        item.time
      );
      
      // Close the notification
      this.close();
    };

    // Simple fallback if notification doesn't display
    notification.onerror = function(e) {
      console.error('Notification error:', e);
      alert(`Medication Reminder: Time to take ${item.name}`);
    };
  }

  startProcessing() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.checkInterval = setInterval(() => this.processQueue(), QUEUE_CHECK_INTERVAL);
    // Process immediately on start
    this.processQueue();
    console.log('Started notification queue processing');
  }

  stopProcessing() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('Stopped notification queue processing');
    }
  }
}

const notificationQueue = new WebNotificationQueue();

class WebNotificationService {
  constructor() {
    this.hasPermission = false;
    this.initialize();
  }

  async initialize() {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      this.hasPermission = permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    }
  }

  async scheduleMedicationReminder(medication) {
    if (!this.hasPermission) {
      console.log('Notification permission not granted');
      return;
    }

    try {
      const { name, times } = medication;
      
      times.forEach(time => {
        const [hours, minutes] = time.split(':').map(Number);
        const now = new Date();
        const scheduledTime = new Date(now);
        scheduledTime.setHours(hours, minutes, 0, 0);

        // If the time has already passed today, schedule for tomorrow
        if (scheduledTime <= now) {
          scheduledTime.setDate(scheduledTime.getDate() + 1);
        }

        const timeUntilNotification = scheduledTime.getTime() - now.getTime();

        setTimeout(() => {
          this.showMedicationNotification(medication);
        }, timeUntilNotification);
      });
    } catch (error) {
      console.error('Error scheduling medication reminder:', error);
    }
  }

  async showMedicationNotification(medication) {
    if (!this.hasPermission) return;

    try {
      const notification = new Notification(`Time to take ${medication.name}`, {
        body: 'Click to mark as taken or not taken',
        icon: '/icon.png',
        tag: `medication-${medication._id}`,
        requireInteraction: true
      });

      notification.onclick = () => {
        // Focus the window
        window.focus();
        
        // Show custom dialog for marking status
        this.showMedicationDialog(medication);
        
        // Close the notification
        notification.close();
      };
    } catch (error) {
      console.error('Error showing medication notification:', error);
    }
  }

  async markMedicationAsTaken(medicationId) {
    try {
      // Store status locally
      await this.storeMedicationStatus(medicationId, 'taken');
      
      // Trigger UI update by dispatching a custom event
      const event = new CustomEvent('medicationStatusUpdate', {
        detail: { medicationId, status: 'taken' }
      });
      window.dispatchEvent(event);
      
      // Show confirmation
      this.showConfirmation('Medication marked as taken');
    } catch (error) {
      console.error('Error marking medication as taken:', error);
      this.showError('Failed to mark medication as taken');
    }
  }

  async markMedicationAsMissed(medicationId) {
    try {
      // Store status locally
      await this.storeMedicationStatus(medicationId, 'not_taken');
      
      // Trigger UI update by dispatching a custom event
      const event = new CustomEvent('medicationStatusUpdate', {
        detail: { medicationId, status: 'not_taken' }
      });
      window.dispatchEvent(event);
      
      // Show confirmation
      this.showConfirmation('Medication marked as not taken');
    } catch (error) {
      console.error('Error marking medication as missed:', error);
      this.showError('Failed to mark medication as missed');
    }
  }

  async storeMedicationStatus(medicationId, status) {
    try {
      const key = `medication_status_${medicationId}`;
      const statusData = {
        status,
        updatedAt: new Date().toISOString()
      };
      await AsyncStorage.setItem(key, JSON.stringify(statusData));
    } catch (error) {
      console.error('Error storing medication status:', error);
    }
  }

  showMedicationDialog(medication) {
    // Create and show a custom dialog for marking medication status
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 1000;
      min-width: 300px;
    `;

    dialog.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: #333;">${medication.name}</h3>
      <p style="margin: 0 0 20px 0; color: #666;">Time to take your medication</p>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="mark-taken" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Mark as Taken
        </button>
        <button id="mark-missed" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Mark as Not Taken
        </button>
      </div>
    `;

    // Add overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 999;
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    // Add event listeners
    const markTakenBtn = dialog.querySelector('#mark-taken');
    const markMissedBtn = dialog.querySelector('#mark-missed');

    const closeDialog = () => {
      document.body.removeChild(overlay);
      document.body.removeChild(dialog);
    };

    markTakenBtn.onclick = async () => {
      await this.markMedicationAsTaken(medication._id);
      closeDialog();
    };

    markMissedBtn.onclick = async () => {
      await this.markMedicationAsMissed(medication._id);
      closeDialog();
    };

    // Close dialog when clicking outside
    overlay.onclick = closeDialog;
  }

  showConfirmation(message) {
    const notification = new Notification('Success', {
      body: message,
      icon: '/icon.png'
    });
    setTimeout(() => notification.close(), 3000);
  }

  showError(message) {
    const notification = new Notification('Error', {
      body: message,
      icon: '/icon.png'
    });
    setTimeout(() => notification.close(), 3000);
  }

  async cancelMedicationNotifications(medicationId) {
    // For web notifications, we don't need to explicitly cancel them
    // as they are one-time notifications
    try {
      // Clear the stored status
      await AsyncStorage.removeItem(`medication_status_${medicationId}`);
    } catch (error) {
      console.error('Error canceling medication notifications:', error);
    }
  }

  async storeNotificationData(notificationId, medicationId, userId, time, snoozesLeft = MAX_SNOOZES) {
    try {
      const storedData = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      const notifications = storedData ? JSON.parse(storedData) : {};
      
      notifications[notificationId] = {
        medicationId,
        userId,
        time,
        snoozesLeft,
        name: 'Medication', // Default name
        lastSnoozeTime: new Date().toISOString(),
      };
      
      await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
    } catch (error) {
      console.error('Error storing notification data:', error);
    }
  }

  async getNotificationData(notificationId) {
    try {
      const storedData = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      const notifications = storedData ? JSON.parse(storedData) : {};
      return notifications[notificationId];
    } catch (error) {
      console.error('Error getting notification data:', error);
      return null;
    }
  }

  // Show a dialog with options when a notification is clicked
  showActionsDialog(notificationId, medicationName, medicationId, userId, time) {
    // In a real implementation, you would show a custom dialog
    // For simplicity, we'll use the built-in confirm dialog
    const action = window.confirm(
      `Time to take ${medicationName}. Choose an action:\n\n` +
      `- OK = Mark as Taken\n` +
      `- Cancel = Show More Options`
    );
    
    if (action) {
      // User clicked "OK" - Mark as Taken
      this.markMedicationAsTaken(medicationId);
    } else {
      // User clicked "Cancel" - Show more options
      const moreOptions = window.confirm(
        `${medicationName}:\n\n` +
        `- OK = Snooze (${SNOOZE_DURATION} seconds)\n` +
        `- Cancel = Mark as Not Taken`
      );
      
      if (moreOptions) {
        // User clicked "OK" - Snooze
        this.snoozeNotification(notificationId);
      } else {
        // User clicked "Cancel" - Mark as Not Taken
        this.markMedicationAsMissed(medicationId);
      }
    }
  }

  async snoozeNotification(notificationId) {
    if (Platform.OS !== 'web') {
      return { success: false, message: 'Web notifications are only supported on the web platform' };
    }

    try {
      const notificationData = await this.getNotificationData(notificationId);
      
      if (!notificationData) {
        return { success: false, message: 'Notification data not found' };
      }

      // Check if we've reached max snoozes
      if (notificationData.snoozesLeft <= 0) {
        return { 
          success: false, 
          message: 'Maximum snoozes reached. Please take your medication or mark it as missed.' 
        };
      }

      // Create a temporary medication object from notification data
      const tempMed = {
        _id: notificationData.medicationId,
        user_id: notificationData.userId,
        name: notificationData.name || 'Medication'
      };

      // Add snooze to queue with decremented snoozesLeft
      const newSnoozesLeft = notificationData.snoozesLeft - 1;
      await notificationQueue.addSnoozeToQueue(
        tempMed, 
        notificationData.time, 
        notificationId, 
        newSnoozesLeft
      );

      return { 
        success: true,
        message: `Medication snoozed for ${SNOOZE_DURATION} seconds. ${newSnoozesLeft} snoozes remaining.`
      };
    } catch (error) {
      console.error('Error snoozing notification:', error);
      return { success: false, message: error.message };
    }
  }
}

export const webNotificationService = new WebNotificationService();