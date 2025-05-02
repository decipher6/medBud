import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Text, Pressable, AppState, Alert } from 'react-native';
import { 
  TextInput, Button, Card, Title, Paragraph, Snackbar, 
  ActivityIndicator, Portal, Dialog, Divider, FAB,
  Chip, Surface, ProgressBar, Badge, IconButton
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from '../services/api';
import { theme } from '../theme/theme';
import { useAuth } from '../services/authService';

// Temporary user ID - In a real app, this would come from authentication
const USER_ID = '67ebd559c9003543caba959c';

// Constants for validation
const MAX_SYMPTOM_NAME_WORDS = 100;
const MAX_DETAILS_WORDS = 500;
const MAX_RECENT_SYMPTOMS = 10;
const PENDING_SYMPTOMS_STORAGE_KEY = `pending_symptoms_${USER_ID}`;

function SymptomScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [symptoms, setSymptoms] = useState([]);
  const [newSymptom, setNewSymptom] = useState({
    name: '',
    severity: '',
    notes: ''
  });
  const [pendingSymptoms, setPendingSymptoms] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [inputErrors, setInputErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const limit = 20; // Number of items per page

  // Load symptoms and pending symptoms on mount
  useEffect(() => {
    loadSymptoms();
    loadPendingSymptoms();
    setupNetworkListeners();
    setupAppStateListener();
    
    return () => {
      NetInfo.removeAllListeners();
      AppState.removeEventListener('change');
    };
  }, []);
  
  // Setup network state listeners
  const setupNetworkListeners = () => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const isConnected = state.isConnected && state.isInternetReachable;
      setIsOnline(isConnected);
      
      // Try to sync pending symptoms when connection is restored
      if (isConnected) {
        syncPendingSymptoms();
      }
    });
    
    // Initial network check
    NetInfo.fetch().then(state => {
      setIsOnline(state.isConnected && state.isInternetReachable);
    });
    
    return unsubscribe;
  };
  
  // Setup app state listener to sync when app comes to foreground
  const setupAppStateListener = () => {
    AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        // Check connection and sync pending symptoms when app becomes active
        NetInfo.fetch().then(state => {
          setIsOnline(state.isConnected && state.isInternetReachable);
          if (state.isConnected && state.isInternetReachable) {
            syncPendingSymptoms();
          }
        });
      }
    });
  };
  
  // Load pending symptoms from AsyncStorage
  const loadPendingSymptoms = async () => {
    try {
      const storedSymptoms = await AsyncStorage.getItem(PENDING_SYMPTOMS_STORAGE_KEY);
      if (storedSymptoms) {
        const parsedSymptoms = JSON.parse(storedSymptoms);
        setPendingSymptoms(parsedSymptoms);
      }
    } catch (error) {
      console.error('Error loading pending symptoms from storage:', error);
    }
  };
  
  // Save pending symptoms to AsyncStorage
  const savePendingSymptoms = async (updatedPendingSymptoms) => {
    try {
      await AsyncStorage.setItem(
        PENDING_SYMPTOMS_STORAGE_KEY, 
        JSON.stringify(updatedPendingSymptoms)
      );
    } catch (error) {
      console.error('Error saving pending symptoms to storage:', error);
    }
  };
  
  // Sync pending symptoms with the server
  const syncPendingSymptoms = async () => {
    if (pendingSymptoms.length === 0 || isSyncing) return;
    
    try {
      setIsSyncing(true);
      let successCount = 0;
      let failedSymptoms = [];
      
      // Process each pending symptom
      for (const symptom of pendingSymptoms) {
        try {
          await api.createSymptom(symptom, USER_ID);
          successCount++;
        } catch (error) {
          console.error('Failed to sync symptom:', error);
          failedSymptoms.push(symptom);
        }
      }
      
      // Update pending symptoms with only the failed ones
      setPendingSymptoms(failedSymptoms);
      await savePendingSymptoms(failedSymptoms);
      
      // Refresh symptom list if any were successfully synced
      if (successCount > 0) {
        setSkip(0);
        await loadSymptoms(true);
        
        // Show success message
        const message = failedSymptoms.length > 0 
          ? `Synced ${successCount} symptoms. ${failedSymptoms.length} still pending.`
          : `Successfully synced ${successCount} pending symptoms.`;
        
        setError(message); // Using error state for notifications
      }
    } catch (error) {
      console.error('Error during sync:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    };

    try {
      return new Intl.DateTimeFormat('en-US', options).format(date);
    } catch (error) {
      console.error('Error formatting date with timezone:', error);
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  };

  const loadSymptoms = async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
        setSkip(0);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const currentSkip = refresh ? 0 : skip;
      
      // Only try to fetch from API if online
      let symptomsData = [];
      if (isOnline) {
        symptomsData = await api.getSymptoms(USER_ID, currentSkip, limit);
      } else {
        // If offline, just use what we have and show a message
        setError('You are offline. Showing cached symptoms.');
      }

      const sortedSymptoms = symptomsData
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, MAX_RECENT_SYMPTOMS);

      if (refresh) {
        setSymptoms(sortedSymptoms);
      } else {
        setSymptoms(prev => [...prev, ...sortedSymptoms]);
      }

      setHasMore(symptomsData.length === limit);
      if (!refresh) {
        setSkip(currentSkip + symptomsData.length);
      }
    } catch (error) {
      console.error('Error loading symptoms:', error);
      setError('Failed to load symptoms. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const validateSymptom = () => {
    let isValid = true;
    const errors = {};

    if (!newSymptom.name.trim()) {
      errors.name = 'Symptom name is required';
      isValid = false;
    }

    if (!newSymptom.severity) {
      errors.severity = 'Severity is required';
      isValid = false;
    }

    if (!newSymptom.notes.trim()) {
      errors.notes = 'Details are required';
      isValid = false;
    }

    const nameWordCount = newSymptom.name.trim().split(/\s+/).length;
    if (nameWordCount > MAX_SYMPTOM_NAME_WORDS) {
      errors.name = `Symptom name cannot exceed ${MAX_SYMPTOM_NAME_WORDS} words`;
      isValid = false;
    }

    const detailsWordCount = newSymptom.notes.trim().split(/\s+/).length;
    if (detailsWordCount > MAX_DETAILS_WORDS) {
      errors.notes = `Details cannot exceed ${MAX_DETAILS_WORDS} words`;
      isValid = false;
    }

    setInputErrors(errors);
    return isValid;
  };

  const addSymptom = async () => {
    if (!validateSymptom()) return;

    try {
      setIsLoading(true);
      setError(null);

      const symptomData = {
        name: newSymptom.name.trim(),
        details: newSymptom.notes.trim(),
        severity: parseInt(newSymptom.severity),
        timestamp: new Date().toISOString() // Add local timestamp
      };

      // Add locally generated temporary ID
      const tempSymptom = {
        ...symptomData,
        _id: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        isPending: true
      };

      if (isOnline) {
        // If online, try to send to server
        try {
      await api.createSymptom(symptomData, USER_ID);
      
          // Refresh symptom list
      setSkip(0);
      await loadSymptoms(true);
        } catch (error) {
          console.error('Error adding symptom:', error);
          
          // If API call fails, add to pending queue
          const updatedPendingSymptoms = [...pendingSymptoms, symptomData];
          setPendingSymptoms(updatedPendingSymptoms);
          await savePendingSymptoms(updatedPendingSymptoms);
          
          // Add to local display with pending status
          setSymptoms(prev => [tempSymptom, ...prev]);
          
          setError('Failed to save symptom online. It will be synced when connection is restored.');
        }
      } else {
        // If offline, add to pending queue
        const updatedPendingSymptoms = [...pendingSymptoms, symptomData];
        setPendingSymptoms(updatedPendingSymptoms);
        await savePendingSymptoms(updatedPendingSymptoms);
        
        // Add to local display with pending status
        setSymptoms(prev => [tempSymptom, ...prev]);
        
        setError('You are offline. Symptom saved locally and will be synced when you are back online.');
      }

      setNewSymptom({ name: '', severity: '', notes: '' });
      setShowAddDialog(false);
    } catch (error) {
      console.error('Error in add symptom process:', error);
      setError('Failed to process your request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = useCallback(() => {
    if (isOnline) {
      loadSymptoms(true);
    } else {
      setError('Cannot refresh while offline');
      setIsRefreshing(false);
    }
  }, [isOnline]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore && isOnline) {
      loadSymptoms();
    }
  }, [isLoading, hasMore, isOnline]);

  const isCloseToBottom = ({ layoutMeasurement, contentOffset, contentSize }) => {
    const paddingToBottom = 20;
    return layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
  };

  const getSeverityColor = (severity) => {
    if (!severity) return theme.colors.disabled;
    const numSeverity = parseInt(severity, 10);
    if (isNaN(numSeverity)) return theme.colors.disabled;
    
    if (numSeverity <= 3) return theme.severityColors.low;
    if (numSeverity <= 6) return theme.severityColors.medium;
    return theme.severityColors.high;
  };

  if (isLoading && !isRefreshing && !symptoms.length) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading your symptoms...</Text>
      </View>
    );
  }

  const renderSeveritySelector = () => {
    return (
      <View style={styles.severityContainer}>
        <Text style={styles.severityLabel}>Severity (1-10)</Text>
        <View style={styles.severityScale}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
            <Pressable
              key={value}
              style={[
                styles.severityButton,
                parseInt(newSymptom.severity) === value && styles.selectedSeverity,
                parseInt(newSymptom.severity) === value && { backgroundColor: getSeverityColor(value) }
              ]}
              onPress={() => {
                setNewSymptom({ ...newSymptom, severity: value.toString() });
                if (inputErrors.severity) {
                  const newErrors = {...inputErrors};
                  delete newErrors.severity;
                  setInputErrors(newErrors);
                }
              }}
            >
              <Text 
                style={[
                  styles.severityButtonText,
                  parseInt(newSymptom.severity) === value && styles.selectedSeverityText
                ]}
              >
                {value}
              </Text>
            </Pressable>
          ))}
        </View>
        {inputErrors.severity && <Text style={styles.errorText}>{inputErrors.severity}</Text>}
      </View>
    );
  };

  return (
    <View style={[styles.container, {paddingBottom: insets.bottom}]}>
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline" size={18} color="#fff" />
          <Text style={styles.offlineText}>You are offline</Text>
        </View>
      )}
      
      {pendingSymptoms.length > 0 && isOnline && (
        <Pressable 
          style={styles.syncBanner} 
          onPress={syncPendingSymptoms}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#fff" style={styles.syncIcon} />
          ) : (
            <Ionicons name="sync" size={18} color="#fff" style={styles.syncIcon} />
          )}
          <Text style={styles.syncText}>
            {isSyncing 
              ? `Syncing ${pendingSymptoms.length} pending symptoms...` 
              : `Tap to sync ${pendingSymptoms.length} pending symptoms`}
          </Text>
        </Pressable>
      )}

    <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
            colors={[theme.colors.primary]}
        />
      }
      onScroll={({ nativeEvent }) => {
        if (isCloseToBottom(nativeEvent)) {
          loadMore();
        }
      }}
      scrollEventThrottle={400}
    >
        {symptoms.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Ionicons name="medical-outline" size={64} color={theme.colors.disabled} />
            <Text style={styles.emptyStateText}>
              You haven't logged any symptoms yet
            </Text>
            <Button 
              mode="contained" 
              onPress={() => setShowAddDialog(true)}
              style={styles.emptyStateButton}
              icon="plus"
            >
              Log Your First Symptom
            </Button>
          </View>
        ) : (
          <>
            <Surface style={styles.headerCard}>
              <Text style={styles.headerTitle}>Symptom History</Text>
              <Text style={styles.headerSubtitle}>
                Keep track of your health by logging and monitoring your symptoms
              </Text>
            </Surface>

            {symptoms.map((symptom, index) => (
              <View 
                key={symptom._id} 
              >
                <Card style={styles.symptomCard}>
                  {symptom.isPending && (
                    <Badge 
                      style={styles.pendingBadge}
                      size={24}
                    >
                      <Ionicons name="time-outline" size={12} color="#fff" />
                    </Badge>
                  )}
        <Card.Content>
                    <View style={styles.symptomHeader}>
                      <Title style={styles.symptomName}>{symptom.name}</Title>
                      <Chip 
                        style={[
                          styles.severityChip, 
                          { backgroundColor: getSeverityColor(symptom.severity) }
                        ]}
                      >
                        <Text style={styles.severityChipText}>
                          {symptom.severity || 'N/A'}/10
                        </Text>
                      </Chip>
                    </View>
                    
                    <View style={styles.timeContainer}>
                      <Ionicons name="time-outline" size={16} color={theme.colors.disabled} />
                      <Text style={styles.timeText}>
                        {formatDateTime(symptom.timestamp)}
                        {symptom.isPending && ' (Pending)'}
                      </Text>
                    </View>

                    <Divider style={styles.divider} />
                    
                    {symptom.severity && (
                      <View style={styles.severityBarContainer}>
                        <ProgressBar 
                          progress={symptom.severity / 10} 
                          color={getSeverityColor(symptom.severity)}
                          style={styles.severityBar}
                        />
                        <View style={styles.severityLabels}>
                          <Text style={styles.severityMinLabel}>Mild</Text>
                          <Text style={styles.severityMaxLabel}>Severe</Text>
                        </View>
                      </View>
                    )}
                    
                    {(symptom.details || symptom.notes) && (
                      <View style={styles.detailsContainer}>
                        <Text style={styles.detailsTitle}>Notes:</Text>
                        <Text style={styles.detailsText}>{symptom.details || symptom.notes}</Text>
                      </View>
                    )}
                  </Card.Content>
                </Card>
              </View>
            ))}

            {isLoading && !isRefreshing && (
              <View style={styles.loadMoreContainer}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={styles.loadMoreText}>Loading more...</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <FAB
        icon="plus"
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => setShowAddDialog(true)}
        color="#fff"
      />

      <Portal>
        <Dialog 
          visible={showAddDialog} 
          onDismiss={() => {
            setShowAddDialog(false);
            setInputErrors({});
          }}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>
            Log New Symptom
            {!isOnline && (
              <Text style={styles.dialogOfflineIndicator}> (Offline)</Text>
            )}
          </Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView>
              <View style={styles.dialogContent}>
          <TextInput
            label="Symptom Name"
            value={newSymptom.name}
                  onChangeText={text => {
                    setNewSymptom({...newSymptom, name: text});
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
                  placeholder="e.g. Headache, Fever, Cough"
          />
                {inputErrors.name && <Text style={styles.errorText}>{inputErrors.name}</Text>}

                {renderSeveritySelector()}

          <TextInput
                  label="Symptom Details"
                  value={newSymptom.notes}
            onChangeText={text => {
                    setNewSymptom({...newSymptom, notes: text});
                    if (inputErrors.notes) {
                      const newErrors = {...inputErrors};
                      delete newErrors.notes;
                      setInputErrors(newErrors);
                    }
                  }}
            style={styles.input}
                  error={!!inputErrors.notes}
            multiline
                  numberOfLines={4}
            disabled={isLoading}
                  mode="outlined"
                  placeholder="Describe your symptoms in detail"
                />
                {inputErrors.notes && <Text style={styles.errorText}>{inputErrors.notes}</Text>}
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
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
            onPress={addSymptom}
            loading={isLoading}
              disabled={isLoading}
              mode="contained"
          >
              {isOnline ? 'Save Symptom' : 'Save Offline'}
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
        style={[
          styles.snackbar,
          error && error.includes('offline') ? styles.warningSnackbar : 
          error && error.includes('synced') ? styles.successSnackbar : 
          styles.errorSnackbar
        ]}
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
  scrollView: {
    flex: 1,
  },
  contentContainer: {
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
  symptomCard: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.roundness,
    ...theme.shadows.medium,
    backgroundColor: theme.colors.background,
    position: 'relative',
  },
  pendingBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: theme.colors.warning,
    zIndex: 1,
  },
  symptomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  symptomName: {
    ...theme.typography.h3,
    fontSize: 18,
    color: theme.colors.text,
    flex: 1,
  },
  severityChip: {
    height: 28,
  },
  severityChipText: {
    color: '#fff',
    ...theme.typography.bold,
    fontSize: 12,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  timeText: {
    ...theme.typography.caption,
    color: theme.colors.disabled,
    marginLeft: theme.spacing.xs,
  },
  divider: {
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing.sm,
  },
  severityBarContainer: {
    marginVertical: theme.spacing.sm,
  },
  severityBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.surface,
  },
  severityLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  severityMinLabel: {
    ...theme.typography.caption,
    color: theme.colors.disabled,
  },
  severityMaxLabel: {
    ...theme.typography.caption,
    color: theme.colors.disabled,
  },
  detailsContainer: {
    marginTop: theme.spacing.sm,
  },
  detailsTitle: {
    ...theme.typography.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  detailsText: {
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
  loadMoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    flexDirection: 'row',
  },
  loadMoreText: {
    ...theme.typography.body2,
    color: theme.colors.disabled,
    marginLeft: theme.spacing.sm,
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
  dialog: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.roundness,
    maxHeight: '80%',
  },
  dialogTitle: {
    ...theme.typography.h3,
    color: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dialogOfflineIndicator: {
    color: theme.colors.error,
    fontSize: 14,
  },
  dialogScrollArea: {
    paddingHorizontal: 0,
  },
  dialogContent: {
    padding: theme.spacing.md,
  },
  input: {
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  severityContainer: {
    marginBottom: theme.spacing.md,
  },
  severityLabel: {
    ...theme.typography.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  severityScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  severityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.divider,
  },
  selectedSeverity: {
    borderWidth: 0,
  },
  severityButtonText: {
    ...theme.typography.medium,
    fontSize: 12,
    color: theme.colors.text,
  },
  selectedSeverityText: {
    color: '#fff',
  },
  errorText: {
    ...theme.typography.caption,
    color: theme.colors.error,
    marginTop: -theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    marginLeft: theme.spacing.xs,
  },
  snackbar: {
    margin: theme.spacing.md,
  },
  errorSnackbar: {
    backgroundColor: theme.colors.error,
  },
  warningSnackbar: {
    backgroundColor: theme.colors.warning,
  },
  successSnackbar: {
    backgroundColor: theme.colors.success || '#4CAF50',
  },
  offlineBanner: {
    backgroundColor: theme.colors.error,
    padding: theme.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  offlineText: {
    color: '#fff',
    ...theme.typography.medium,
    marginLeft: theme.spacing.xs,
  },
  syncBanner: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center'
  }
});

export default SymptomScreen; 