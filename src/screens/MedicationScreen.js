import React, { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, Alert, View, Pressable, Platform, TouchableOpacity, FlatList } from 'react-native';
import { 
  TextInput, Button, Card, Title, Paragraph, IconButton, 
  Snackbar, Portal, Dialog, ActivityIndicator, FAB,
  Divider, Text, Chip, Surface
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { theme } from '../theme/theme';
import { useContext } from 'react';
import { UserContext } from '../../App';
import DateTimePicker from '@react-native-community/datetimepicker';
import { NotificationService } from '../services/notifications';
import { webNotificationService } from '../services/WebNotificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMedication } from '../context/MedicationContext';
import { EventRegister } from 'react-native-event-listeners';

function MedicationScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useContext(UserContext);
  const { medicationStatuses, updateMedicationStatus } = useMedication();
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newMedication, setNewMedication] = useState({
    name: '',
    frequency: 1,
    times: [''],
    notes: ''
  });
  const [editingMedication, setEditingMedication] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [inputErrors, setInputErrors] = useState({});
  const [showTimePicker, setShowTimePicker] = useState(null);

  // Load medications and their statuses
  const loadMedications = async () => {
    try {
      setLoading(true);
      const data = await api.getMedications(user.id);
      setMedications(data);
    } catch (error) {
      console.error('Error loading medications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load medication statuses from AsyncStorage
  const loadMedicationStatuses = async () => {
    try {
      const statuses = {};
      for (const medication of medications) {
        const key = `medication_status_${medication._id}`;
        const statusData = await AsyncStorage.getItem(key);
        if (statusData) {
          const { status, updatedAt } = JSON.parse(statusData);
          statuses[medication._id] = { status, updatedAt };
        }
      }
      // Update all statuses in the context
      Object.entries(statuses).forEach(([medicationId, statusData]) => {
        updateMedicationStatus(medicationId, statusData.status);
      });
    } catch (error) {
      console.error('Error loading medication statuses:', error);
    }
  };

  // Handle status updates
  const handleUpdateMedicationStatus = async (medicationId, status) => {
    try {
      // Update status in context
      await updateMedicationStatus(medicationId, status);
      
      // Store status locally
      const key = `medication_status_${medicationId}`;
      const statusData = {
        status,
        updatedAt: new Date().toISOString()
      };
      await AsyncStorage.setItem(key, JSON.stringify(statusData));
      
      // Refresh medications to ensure UI is up to date
      await loadMedications();
    } catch (error) {
      console.error('Error updating medication status:', error);
    }
  };

  // Load medications and statuses on mount and when user changes
  useEffect(() => {
    if (user?.id) {
      loadMedications();
    }
  }, [user?.id]);

  // Load statuses when medications change
  useEffect(() => {
    if (medications.length > 0) {
      loadMedicationStatuses();
    }
  }, [medications]);

  // Add this effect to listen for medication status updates from notifications
  useEffect(() => {
    const handleMedicationStatusUpdate = (event) => {
      const { medicationId, status } = event.detail;
      handleUpdateMedicationStatus(medicationId, status);
    };

    window.addEventListener('medicationStatusUpdate', handleMedicationStatusUpdate);

    return () => {
      window.removeEventListener('medicationStatusUpdate', handleMedicationStatusUpdate);
    };
  }, []);

  const validateMedication = (medication) => {
    const errors = {};
    
    if (!medication.name.trim()) {
      errors.name = 'Medication name is required';
    }
    
    if (medication.frequency < 1 || medication.frequency > 5) {
      errors.frequency = 'Frequency must be between 1 and 5';
    }

    if (medication.times.some(time => !time.trim())) {
      errors.times = 'All reminder times are required';
    }
    
    return errors;
  };

  const addMedication = async () => {
    const validationErrors = validateMedication(newMedication);
    
    if (Object.keys(validationErrors).length > 0) {
      setInputErrors(validationErrors);
      return;
    }
  
    try {
      setIsLoading(true);
      setError(null);
      setInputErrors({});
  
      const userId = user.id;
      const medicationData = {
        user_id: userId,
        name: newMedication.name.trim(),
        frequency: newMedication.frequency,
        times: newMedication.times.map(time => time.trim()),
        notes: newMedication.notes.trim() || ''
      };
  
      const response = await api.createMedication(medicationData);
      
      // Schedule notifications for the new medication
      if (Platform.OS === 'web') {
        await webNotificationService.scheduleMedicationReminder(response);
      } else if (Platform.OS !== 'web') {
        // For non-web platforms, use the existing NotificationService if available
        if (typeof NotificationService !== 'undefined') {
          await NotificationService.scheduleMedicationReminder(response);
        }
      }
  
      await loadMedications();
      setNewMedication({ name: '', frequency: 1, times: [''], notes: '' });
      setShowAddDialog(false);
    } catch (error) {
      console.error('Error adding medication:', error);
      setError('Failed to add medication. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = (medication) => {
    setEditingMedication({
      _id: medication._id,
      name: medication.name || '',
      frequency: medication.frequency || 1,
      times: medication.times || [''],
      notes: medication.notes || ''
    });
    setShowEditDialog(true);
    setInputErrors({});
  };

  const updateMedication = async () => {
    const validationErrors = validateMedication(editingMedication);
    
    if (Object.keys(validationErrors).length > 0) {
      setInputErrors(validationErrors);
      return;
    }
  
    try {
      setIsLoading(true);
      setError(null);
      setInputErrors({});
  
      const userId = user.id;
      const medicationData = {
        name: editingMedication.name.trim(),
        frequency: editingMedication.frequency,
        times: editingMedication.times.map(time => time.trim()),
        notes: editingMedication.notes.trim() || ''
      };
  
      // Cancel existing notifications
      if (Platform.OS === 'web') {
        await webNotificationService.cancelMedicationNotifications(editingMedication._id);
      } else if (Platform.OS !== 'web') {
        if (typeof NotificationService !== 'undefined') {
          await NotificationService.cancelMedicationNotifications(editingMedication._id);
        }
      }
  
      const response = await api.updateMedication(editingMedication._id, medicationData, userId);
      
      // Schedule new notifications
      if (Platform.OS === 'web') {
        await webNotificationService.scheduleMedicationReminder(response);
      } else if (Platform.OS !== 'web') {
        if (typeof NotificationService !== 'undefined') {
          await NotificationService.scheduleMedicationReminder(response);
        }
      }
  
      await loadMedications();
      setShowEditDialog(false);
      setEditingMedication(null);
    } catch (error) {
      console.error('Error updating medication:', error);
      setError('Failed to update medication. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteMedication = async (medicationId, medicationName) => {
    Alert.alert(
      'Delete Medication',
      `Are you sure you want to delete ${medicationName}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              setError(null);
              const userId = user.id;
              
              // Cancel notifications before deleting
              if (Platform.OS === 'web') {
                await webNotificationService.cancelMedicationNotifications(medicationId);
              } else if (Platform.OS !== 'web') {
                if (typeof NotificationService !== 'undefined') {
                  await NotificationService.cancelMedicationNotifications(medicationId);
                }
              }
              
              // Also remove from local status tracking
              const newStatuses = {...medicationStatuses};
              delete newStatuses[medicationId];
              updateMedicationStatus(medicationId, null);
              await loadMedicationStatuses();
              
              await api.deleteMedication(medicationId, userId);
              await loadMedications();
            } catch (error) {
              console.error('Error deleting medication:', error);
              setError('Failed to delete medication. Please try again.');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const renderTimeInputs = (medication, isEditing = false) => {
    const times = isEditing ? editingMedication.times : newMedication.times;
    const setTimes = (newTimes) => {
      if (isEditing) {
        setEditingMedication({...editingMedication, times: newTimes});
      } else {
        setNewMedication({...newMedication, times: newTimes});
      }
    };

    return (
      <View style={styles.timeInputsContainer}>
        <Text style={styles.timeInputsLabel}>Reminder Times</Text>
        {Array.from({ length: medication.frequency }).map((_, index) => (
          <View key={index} style={styles.timeInputRow}>
            <Text style={styles.timeLabel}>Time {index + 1}</Text>
            <TextInput
              type="time"
              value={times[index] || ''}
              onChangeText={text => {
                const newTimes = [...times];
                newTimes[index] = text;
                setTimes(newTimes);
              }}
              style={styles.timeInput}
              disabled={isLoading}
              mode="outlined"
              placeholder="Select time"
            />
          </View>
        ))}
        {inputErrors.times && <Text style={styles.errorText}>{inputErrors.times}</Text>}
      </View>
    );
  };

  const getMedicationStatus = (medicationId) => {
    return medicationStatuses[medicationId]?.status || null;
  };

  const getMedicationStatusUpdateTime = (medicationId) => {
    return medicationStatuses[medicationId]?.updatedAt || null;
  };

  const getStatusColor = (status) => {
    if (!status) return null;
    return status === 'taken' 
      ? theme.colors.success || '#4CAF50' 
      : theme.colors.error;
  };

  if (loading && !medications.length) {
    return (
      <View style={[styles.loadingContainer, {paddingTop: insets.top}]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading your medications...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, {paddingBottom: insets.bottom}]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} />
        ) : (
          <>
            <Surface style={styles.headerCard}>
              <Text style={styles.headerTitle}>Your Medication List</Text>
              <Text style={styles.headerSubtitle}>
                Track all your medications and dosages in one place
              </Text>
            </Surface>

            <FlatList
              data={medications}
              keyExtractor={(item) => item._id.toString()}
              renderItem={({ item }) => {
                const status = getMedicationStatus(item._id);
                const statusUpdateTime = getMedicationStatusUpdateTime(item._id);
                return (
                  <View key={item._id}>
                    <Card style={[
                      styles.medicationCard,
                      status === 'taken' && styles.medicationCardTaken,
                      status === 'not_taken' && styles.medicationCardNotTaken
                    ]}>
                      <Card.Content>
                        <View style={styles.cardHeader}>
                          <Title style={styles.medicationName}>{item.name}</Title>
                          <View style={styles.cardActions}>
                            <View style={styles.statusButtonsContainer}>
                              <TouchableOpacity
                                style={[
                                  styles.statusButton,
                                  status === 'taken' && styles.statusButtonActive
                                ]}
                                onPress={() => handleUpdateMedicationStatus(item._id, 'taken')}
                              >
                                <Ionicons 
                                  name="checkmark" 
                                  size={18} 
                                  color={status === 'taken' ? '#fff' : theme.colors.success || '#4CAF50'} 
                                />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[
                                  styles.statusButton,
                                  status === 'not_taken' && styles.statusButtonNotTaken
                                ]}
                                onPress={() => handleUpdateMedicationStatus(item._id, 'not_taken')}
                              >
                                <Ionicons 
                                  name="close" 
                                  size={18} 
                                  color={status === 'not_taken' ? '#fff' : theme.colors.error} 
                                />
                              </TouchableOpacity>
                            </View>
                            <IconButton
                              icon="pencil"
                              iconColor={theme.colors.primary}
                              size={20}
                              onPress={() => startEditing(item)}
                              style={styles.actionButton}
                            />
                            <IconButton
                              icon="delete"
                              iconColor={theme.colors.error}
                              size={20}
                              onPress={() => deleteMedication(item._id, item.name)}
                              style={styles.actionButton}
                            />
                          </View>
                        </View>
                        
                        {status && (
                          <View style={[
                            styles.statusIndicator, 
                            { backgroundColor: getStatusColor(status) }
                          ]}>
                            <Ionicons 
                              name={status === 'taken' ? 'checkmark' : 'close'} 
                              size={14} 
                              color="#fff" 
                            />
                            <Text style={styles.statusText}>
                              {status === 'taken' ? 'Taken' : 'Not Taken'}
                            </Text>
                            {statusUpdateTime && (
                              <Text style={styles.statusTimeText}>
                                {new Date(statusUpdateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </Text>
                            )}
                          </View>
                        )}
                        
                        <Divider style={styles.divider} />
                        
                        <View style={styles.medInfoRow}>
                          <Ionicons name="fitness-outline" size={20} color={theme.colors.primary} />
                          <Text style={styles.medInfoLabel}>Frequency:</Text>
                          <Text style={styles.medInfoValue}>{item.frequency || 1} times per day</Text>
                        </View>
                        
                        {item.times && item.times.length > 0 && (
                          <View style={styles.timeInputsContainer}>
                            <Text style={styles.timeInputsLabel}>Reminder Times:</Text>
                            {item.times.map((time, index) => (
                              <View key={index} style={styles.timeInputRow}>
                                <Text style={styles.timeInput}>{time}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        
                        {item.notes && (
                          <View style={styles.notesContainer}>
                            <Text style={styles.notesLabel}>Notes:</Text>
                            <Text style={styles.notesText}>{item.notes}</Text>
                          </View>
                        )}
                      </Card.Content>
                    </Card>
                  </View>
                );
              }}
              refreshing={refreshing}
              onRefresh={loadMedications}
              contentContainerStyle={styles.listContainer}
            />
          </>
        )}
      </ScrollView>

      <FAB
        icon={props => <Ionicons name="add" size={24} color="#fff" {...props} />}
        style={[styles.fab, {bottom: insets.bottom + 16}]}
        onPress={() => setShowAddDialog(true)}
      />

      {/* Add Medication Dialog */}
      <Portal>
        <Dialog 
          visible={showAddDialog} 
          onDismiss={() => {
            setShowAddDialog(false);
            setInputErrors({});
          }}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>Add New Medication</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Medication Name"
              value={newMedication.name}
              onChangeText={text => {
                setNewMedication({...newMedication, name: text});
                if (inputErrors.name) {
                  const newErrors = {...inputErrors};
                  delete newErrors.name;
                  setInputErrors(newErrors);
                }
              }}
              style={styles.input}
              error={!!inputErrors.name}
              disabled={isLoading}
              mode="outlined"
            />
            {inputErrors.name && <Text style={styles.errorText}>{inputErrors.name}</Text>}
            
            <View style={styles.frequencyContainer}>
              <Text style={styles.frequencyLabel}>Frequency (1-5 times per day)</Text>
              <View style={styles.frequencyScale}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable
                    key={value}
                    style={[
                      styles.frequencyButton,
                      newMedication.frequency === value && styles.selectedFrequency,
                    ]}
                    onPress={() => {
                      setNewMedication({...newMedication, frequency: value});
                      if (inputErrors.frequency) {
                        const newErrors = {...inputErrors};
                        delete newErrors.frequency;
                        setInputErrors(newErrors);
                      }
                    }}
                  >
                    <Text 
                      style={[
                        styles.frequencyButtonText,
                        newMedication.frequency === value && styles.selectedFrequencyText
                      ]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {inputErrors.frequency && <Text style={styles.errorText}>{inputErrors.frequency}</Text>}
            </View>

            {renderTimeInputs(newMedication)}
            
            <TextInput
              label="Notes"
              value={newMedication.notes}
              onChangeText={text => setNewMedication({...newMedication, notes: text})}
              multiline
              numberOfLines={3}
              style={[styles.input, styles.notesInput]}
              disabled={isLoading}
              mode="outlined"
              placeholder="Any special instructions or additional information"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button 
              onPress={() => {
                setShowAddDialog(false);
                setInputErrors({});
              }}
              textColor={theme.colors.text}
            >
              Cancel
            </Button>
            <Button 
              onPress={addMedication}
              loading={isLoading}
              disabled={isLoading}
              mode="contained"
            >
              Add Medication
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Edit Medication Dialog */}
      <Portal>
        <Dialog 
          visible={showEditDialog} 
          onDismiss={() => {
            setShowEditDialog(false);
            setInputErrors({});
          }}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>Edit Medication</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Medication Name"
              value={editingMedication?.name || ''}
              onChangeText={text => {
                setEditingMedication({...editingMedication, name: text});
                if (inputErrors.name) {
                  const newErrors = {...inputErrors};
                  delete newErrors.name;
                  setInputErrors(newErrors);
                }
              }}
              style={styles.input}
              error={!!inputErrors.name}
              disabled={isLoading}
              mode="outlined"
            />
            {inputErrors.name && <Text style={styles.errorText}>{inputErrors.name}</Text>}
            
            <View style={styles.frequencyContainer}>
              <Text style={styles.frequencyLabel}>Frequency (1-5 times per day)</Text>
              <View style={styles.frequencyScale}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable
                    key={value}
                    style={[
                      styles.frequencyButton,
                      editingMedication?.frequency === value && styles.selectedFrequency,
                    ]}
                    onPress={() => {
                      setEditingMedication({...editingMedication, frequency: value});
                      if (inputErrors.frequency) {
                        const newErrors = {...inputErrors};
                        delete newErrors.frequency;
                        setInputErrors(newErrors);
                      }
                    }}
                  >
                    <Text 
                      style={[
                        styles.frequencyButtonText,
                        editingMedication?.frequency === value && styles.selectedFrequencyText
                      ]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {inputErrors.frequency && <Text style={styles.errorText}>{inputErrors.frequency}</Text>}
            </View>

            {editingMedication && renderTimeInputs(editingMedication, true)}
            
            <TextInput
              label="Notes"
              value={editingMedication?.notes || ''}
              onChangeText={text => setEditingMedication({...editingMedication, notes: text})}
              multiline
              numberOfLines={3}
              style={[styles.input, styles.notesInput]}
              disabled={isLoading}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button 
              onPress={() => {
                setShowEditDialog(false);
                setInputErrors({});
              }}
              textColor={theme.colors.text}
            >
              Cancel
            </Button>
            <Button 
              onPress={updateMedication}
              loading={isLoading}
              disabled={isLoading}
              mode="contained"
            >
              Save Changes
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError(null)}
        action={{
          label: 'Dismiss',
          onPress: () => setError(null),
        }}
        style={styles.snackbar}
        duration={3000}
      >
        {error}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: theme.spacing.md,
  },
  headerCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderRadius: theme.roundness,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.small,
  },
  headerTitle: {
    ...theme.typography.h3,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  headerSubtitle: {
    ...theme.typography.body2,
    color: theme.colors.disabled,
  },
  medicationCard: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.roundness,
    ...theme.shadows.medium,
    backgroundColor: theme.colors.background,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.divider,
  },
  medicationCardTaken: {
    borderLeftColor: theme.colors.success || '#4CAF50',
  },
  medicationCardNotTaken: {
    borderLeftColor: theme.colors.error,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  medicationName: {
    ...theme.typography.h3,
    color: theme.colors.text,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusButtonsContainer: {
    flexDirection: 'row',
    marginRight: theme.spacing.xs,
  },
  statusButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.divider,
    marginHorizontal: 2,
  },
  statusButtonActive: {
    backgroundColor: theme.colors.success || '#4CAF50',
    borderColor: theme.colors.success || '#4CAF50',
  },
  statusButtonNotTaken: {
    backgroundColor: theme.colors.error,
    borderColor: theme.colors.error,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  statusText: {
    color: '#fff',
    ...theme.typography.medium,
    fontSize: 12,
    marginLeft: 4,
  },
  statusTimeText: {
    color: '#fff',
    ...theme.typography.regular,
    fontSize: 10,
    marginLeft: 4,
    opacity: 0.8,
  },
  actionButton: {
    margin: -4,
  },
  divider: {
    marginVertical: theme.spacing.sm,
    backgroundColor: theme.colors.divider,
  },
  medInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  medInfoLabel: {
    ...theme.typography.medium,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
    marginRight: theme.spacing.xs,
  },
  medInfoValue: {
    ...theme.typography.regular,
    color: theme.colors.text,
    flex: 1,
  },
  notesContainer: {
    marginTop: theme.spacing.sm,
  },
  notesLabel: {
    ...theme.typography.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  notesText: {
    ...theme.typography.body2,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    borderRadius: theme.roundness / 2,
  },
  fab: {
    position: 'absolute',
    right: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.medium,
  },
  dialog: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.roundness,
  },
  dialogTitle: {
    ...theme.typography.h3,
    color: theme.colors.primary,
  },
  input: {
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  notesInput: {
    minHeight: 80,
  },
  errorText: {
    ...theme.typography.caption,
    color: theme.colors.error,
    marginTop: -theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    marginLeft: theme.spacing.xs,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  loadingText: {
    ...theme.typography.body1,
    color: theme.colors.disabled,
    marginTop: theme.spacing.md,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    minHeight: 300,
  },
  emptyStateText: {
    ...theme.typography.h3,
    color: theme.colors.disabled,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  emptyStateButton: {
    marginTop: theme.spacing.md,
  },
  snackbar: {
    backgroundColor: theme.colors.primary,
  },
  frequencyContainer: {
    marginBottom: theme.spacing.md,
  },
  frequencyLabel: {
    ...theme.typography.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  frequencyScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },

  frequencyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.divider,
  },
  selectedFrequency: {
    backgroundColor: theme.colors.primary,
    borderWidth: 0,
  },
  frequencyButtonText: {
    ...theme.typography.medium,
    fontSize: 14,
    color: theme.colors.text,
  },
  selectedFrequencyText: {
    color: '#fff',
  },
  timeInputsContainer: {
    marginBottom: theme.spacing.md,
  },
  timeInputsLabel: {
    ...theme.typography.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  timeLabel: {
    ...theme.typography.medium,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
    minWidth: 80,
  },
  timeInput: {
    flex: 1,
    height: 40,
    backgroundColor: theme.colors.background,
  },
  timeText: {
    ...theme.typography.regular,
    color: theme.colors.text,
  },
  listContainer: {
    padding: theme.spacing.md,
  },
});

export default MedicationScreen;