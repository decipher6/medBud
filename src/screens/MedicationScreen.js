import React, { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, Alert, View, Pressable, Platform } from 'react-native';
import { 
  TextInput, Button, Card, Title, Paragraph, IconButton, 
  Snackbar, Portal, Dialog, ActivityIndicator, FAB,
  Divider, Text, Chip, Surface
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { theme } from '../theme/theme';
import { useAuth } from '../services/authService';

// Temporary user ID - In a real app, this would come from authentication
const USER_ID = '67ebd559c9003543caba959c';

function MedicationScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [medications, setMedications] = useState([]);
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

  useEffect(() => {
    loadMedications();
  }, []);

  const loadMedications = async () => {
    try {
      setIsLoading(true);
      const medicationsData = await api.getMedications(USER_ID);
      setMedications(medicationsData);
    } catch (error) {
      console.error('Error loading medications:', error);
      setError('Failed to load medications. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

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

      const medicationData = {
        user_id: USER_ID,
        name: newMedication.name.trim(),
        frequency: newMedication.frequency,
        times: newMedication.times.map(time => time.trim()),
        notes: newMedication.notes.trim() || ''
      };

      await api.createMedication(medicationData);
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

      const medicationData = {
        name: editingMedication.name.trim(),
        frequency: editingMedication.frequency,
        times: editingMedication.times.map(time => time.trim()),
        notes: editingMedication.notes.trim() || ''
      };

      await api.updateMedication(editingMedication._id, medicationData, USER_ID);
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
              await api.deleteMedication(medicationId, USER_ID);
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

  if (isLoading && !medications.length) {
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
        {medications.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Ionicons name="medkit-outline" size={64} color={theme.colors.disabled} />
            <Text style={styles.emptyStateText}>
              You haven't added any medications yet
            </Text>
            <Button 
              mode="contained" 
              onPress={() => setShowAddDialog(true)} 
              style={styles.emptyStateButton}
              icon="plus"
            >
              Add Your First Medication
            </Button>
          </View>
        ) : (
          <>
            <Surface style={styles.headerCard}>
              <Text style={styles.headerTitle}>Your Medication List</Text>
              <Text style={styles.headerSubtitle}>
                Track all your medications and dosages in one place
              </Text>
            </Surface>

            {medications.map((medication, index) => (
              <View 
                key={medication._id} 
              >
                <Card style={styles.medicationCard}>
                  <Card.Content>
                    <View style={styles.cardHeader}>
                      <Title style={styles.medicationName}>{medication.name}</Title>
                      <View style={styles.cardActions}>
                        <IconButton
                          icon="pencil"
                          iconColor={theme.colors.primary}
                          size={20}
                          onPress={() => startEditing(medication)}
                          style={styles.actionButton}
                        />
                        <IconButton
                          icon="delete"
                          iconColor={theme.colors.error}
                          size={20}
                          onPress={() => deleteMedication(medication._id, medication.name)}
                          style={styles.actionButton}
                        />
                      </View>
                    </View>
                    
                    <Divider style={styles.divider} />
                    
                    <View style={styles.medInfoRow}>
                      <Ionicons name="fitness-outline" size={20} color={theme.colors.primary} />
                      <Text style={styles.medInfoLabel}>Frequency:</Text>
                      <Text style={styles.medInfoValue}>{medication.frequency || 1} times per day</Text>
                    </View>
                    
                    {medication.times && medication.times.length > 0 && (
                      <View style={styles.timeInputsContainer}>
                        <Text style={styles.timeInputsLabel}>Reminder Times:</Text>
                        {medication.times.map((time, index) => (
                          <View key={index} style={styles.timeInputRow}>
                            <Text style={styles.timeInput}>{time}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    
                    {medication.notes && (
                      <View style={styles.notesContainer}>
                        <Text style={styles.notesLabel}>Notes:</Text>
                        <Text style={styles.notesText}>{medication.notes}</Text>
                      </View>
                    )}
                  </Card.Content>
                </Card>
              </View>
            ))}
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
    backgroundColor: theme.colors.error,
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
});

export default MedicationScreen;