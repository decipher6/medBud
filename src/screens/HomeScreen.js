import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Text, TouchableOpacity, Image } from 'react-native';
import { 
  Card, Title, Paragraph, Searchbar, ActivityIndicator, 
  Snackbar, Button, Text as PaperText, Chip, Surface, Divider 
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DatePickerModal } from 'react-native-paper-dates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';
import { theme } from '../theme/theme';
import { useContext } from 'react';
import { UserContext } from '../../App';

function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { getUserId } = useContext(UserContext);
  
  // Function to safely get the user ID with a fallback
  const getUserIdSafe = () => {
    const userId = getUserId();
    return userId || '67ebd559c9003543caba959c'; // Fallback for development only
  };

  // Create a key for the pending symptoms that's specific to the user
  const getPendingSymptomStorageKey = () => {
    const userId = getUserIdSafe();
    return `pending_symptoms_${userId}`;
  };

  // Create a key for the pending medications that's specific to the user
  const getPendingMedicationStorageKey = () => {
    const userId = getUserIdSafe();
    return `pending_medications_${userId}`;
  };
  
  // Create a key for medication statuses
  const getMedicationStatusesKey = () => {
    const userId = getUserIdSafe();
    return `medication_statuses_${userId}`;
  };
  
  const [recentSymptoms, setRecentSymptoms] = useState([]);
  const [medications, setMedications] = useState([]);
  const [medicationStatuses, setMedicationStatuses] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [allSymptoms, setAllSymptoms] = useState([]);
  const [filteredSymptoms, setFilteredSymptoms] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchPerformed, setSearchPerformed] = useState(false);

  useEffect(() => {
    if (isFocused) {
      loadData();
      loadMedicationStatuses();
    }
  }, [isFocused]);

  const loadMedicationStatuses = async () => {
    try {
      const statusesKey = getMedicationStatusesKey();
      const storedStatuses = await AsyncStorage.getItem(statusesKey);
      if (storedStatuses) {
        setMedicationStatuses(JSON.parse(storedStatuses));
      }
    } catch (error) {
      console.error('Error loading medication statuses:', error);
    }
  };

  const getMedicationStatus = (medicationId) => {
    return medicationStatuses[medicationId]?.status || null;
  };

  const getMedicationStatusUpdateTime = (medicationId) => {
    return medicationStatuses[medicationId]?.updatedAt || null;
  };

  const loadData = async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const userId = getUserIdSafe();
      
      // Load both symptoms and medications in parallel
      const [symptomsData, medicationsData] = await Promise.all([
        api.getSymptoms(userId, 0, 100),  // Get last 100 symptoms for search
        api.getMedications(userId)
      ]);

      // Ensure symptomsData is an array
      const validSymptoms = Array.isArray(symptomsData) ? symptomsData : [];
      
      setAllSymptoms(validSymptoms);
      // Sort symptoms by timestamp and get the 5 most recent
      const sortedSymptoms = [...validSymptoms].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );
      setRecentSymptoms(sortedSymptoms.slice(0, 5));
      setMedications(medicationsData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setError('Failed to load dashboard data. Pull down to refresh.');
      setAllSymptoms([]);
      setRecentSymptoms([]);
      setMedications([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const performSearch = async () => {
    try {
      if (!searchQuery.trim() && !startDate && !endDate) {
        setSearchError('Please enter a search term or select a date range');
        return;
      }

      setSearchError(null);
      setIsLoading(true);
      
      // Filter symptoms based on search criteria
      let filtered = [...allSymptoms];
      
      // Filter by search query (name or details)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        filtered = filtered.filter(symptom => {
          const nameMatch = symptom.name && symptom.name.toLowerCase().includes(query);
          const detailsMatch = symptom.details && symptom.details.toLowerCase().includes(query);
          return nameMatch || detailsMatch;
        });
      }
      
      // Filter by date range
      if (startDate || endDate) {
        filtered = filtered.filter(symptom => {
          if (!symptom.timestamp) return false;
          
          const symptomDate = new Date(symptom.timestamp);
          
          if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            // Set end date to end of day
            end.setHours(23, 59, 59, 999);
            return symptomDate >= start && symptomDate <= end;
          } else if (startDate) {
            const start = new Date(startDate);
            return symptomDate >= start;
          } else if (endDate) {
            const end = new Date(endDate);
            // Set end date to end of day
            end.setHours(23, 59, 59, 999);
            return symptomDate <= end;
          }
          
          return true;
        });
      }
      
      // Sort results by timestamp (newest first)
      filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      setFilteredSymptoms(filtered);
      setSearchPerformed(true);
      
      if (filtered.length === 0) {
        setSearchError('No symptoms match your search criteria');
      }
    } catch (error) {
      console.error('Error performing search:', error);
      setSearchError('An error occurred while searching');
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = useCallback(() => {
    loadData(true);
    loadMedicationStatuses();
  }, []);

  const onDismissDatePicker = useCallback(() => {
    setDatePickerVisible(false);
  }, []);

  const onConfirmDatePicker = useCallback((params) => {
    setDatePickerVisible(false);
    setStartDate(params.startDate);
    setEndDate(params.endDate);
  }, []);

  const getSeverityColor = (severity) => {
    if (!severity) return theme.colors.disabled;
    const numSeverity = parseInt(severity, 10);
    if (isNaN(numSeverity)) return theme.colors.disabled;
    
    if (numSeverity <= 3) return theme.severityColors.low;
    if (numSeverity <= 6) return theme.severityColors.medium;
    return theme.severityColors.high;
  };

  const getStatusColor = (status) => {
    if (!status) return null;
    return status === 'taken' 
      ? theme.colors.success || '#4CAF50' 
      : theme.colors.error;
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

  const resetSearch = useCallback(() => {
    setSearchQuery('');
    setStartDate(null);
    setEndDate(null);
    setSearchPerformed(false);
    setFilteredSymptoms([]);
    setSearchError(null);
  }, []);

  if (isLoading && !isRefreshing && !recentSymptoms.length) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading your health data...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          colors={[theme.colors.primary]}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Image 
            source={require('../../assets/logo.png')} 
            style={styles.headerLogo} 
            resizeMode="contain"
          />
          <View>
            <Text style={styles.welcomeText}>Welcome to</Text>
            <Text style={styles.appName}>MEDBUD</Text>
            <Text style={styles.tagline}>Your health tracking companion</Text>
          </View>
        </View>
      </View>

      <View>
        <Surface style={styles.searchSurface}>
          <Text style={styles.searchTitle}>Find Symptoms</Text>
          <Searchbar
            placeholder="Search by name or details..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={styles.searchBar}
            iconColor={theme.colors.primary}
            onSubmitEditing={performSearch}
            returnKeyType="search"
          />
          
          <View style={styles.dateFilterContainer}>
            <TouchableOpacity 
              onPress={() => setDatePickerVisible(true)}
              style={styles.dateFilterButton}
            >
              <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.dateFilterText} numberOfLines={1}>
                {startDate && endDate 
                  ? `${formatDateTime(startDate)} - ${formatDateTime(endDate)}`
                  : "Filter by date range"}
              </Text>
            </TouchableOpacity>
            
            {(startDate || endDate) && (
              <TouchableOpacity 
                onPress={() => {
                  setStartDate(null);
                  setEndDate(null);
                }}
                style={styles.clearDateButton}
              >
                <Ionicons name="close-circle" size={18} color={theme.colors.error} />
              </TouchableOpacity>
            )}
          </View>
          
          <View style={styles.searchActionContainer}>
            <Button 
              mode="contained" 
              style={styles.searchButton}
              onPress={performSearch}
              icon="magnify"
            >
              Search
            </Button>
            
            {searchPerformed && (
              <Button 
                mode="outlined" 
                style={styles.resetButton}
                onPress={resetSearch}
              >
                Reset
              </Button>
            )}
          </View>
          
          {searchError && (
            <Text style={styles.errorText}>{searchError}</Text>
          )}
        </Surface>
      </View>

      {searchPerformed && (
        <View>
          <Card style={theme.defaultCardStyle}>
            <Card.Content>
              <View style={styles.searchResultsHeader}>
                <Title style={styles.sectionTitle}>Search Results</Title>
                {filteredSymptoms.length > 0 && (
                  <Chip mode="outlined" style={styles.resultCount}>
                    {filteredSymptoms.length} result{filteredSymptoms.length !== 1 ? 's' : ''}
                  </Chip>
                )}
              </View>
              
              {filteredSymptoms.length > 0 ? (
                filteredSymptoms.map(symptom => (
                  <View key={symptom._id} style={styles.searchResult}>
                    <View style={styles.resultHeader}>
                      <Title style={styles.symptomName}>{symptom.name || 'Unnamed Symptom'}</Title>
                      <View style={[styles.severityPill, {
                        backgroundColor: getSeverityColor(symptom.severity)
                      }]}>
                        <Text style={styles.severityText}>
                          {symptom.severity || 'N/A'}/10
                        </Text>
                      </View>
                    </View>
                    <Paragraph style={styles.dateText}>
                      {symptom.timestamp ? formatDateTime(symptom.timestamp) : 'N/A'}
                    </Paragraph>
                    {symptom.details && (
                      <Paragraph style={styles.details}>{symptom.details}</Paragraph>
                    )}
                    <Divider style={styles.resultDivider} />
                  </View>
                ))
              ) : (
                <View style={styles.emptyStateContainer}>
                  <Ionicons name="search" size={48} color={theme.colors.disabled} />
                  <Text style={styles.noDataMessage}>No matching symptoms found</Text>
                </View>
              )}
            </Card.Content>
          </Card>
        </View>
      )}

      <View>
        <Card style={theme.defaultCardStyle}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Recent Symptoms</Title>
            {recentSymptoms.length > 0 ? (
              recentSymptoms.map((symptom, index) => (
                <View 
                  key={symptom._id} 
                  style={styles.symptomItem}
                >
                  <View style={styles.resultHeader}>
                    <Title style={styles.symptomName}>{symptom.name || 'Unnamed Symptom'}</Title>
                    <View style={[styles.severityPill, {
                      backgroundColor: getSeverityColor(symptom.severity)
                    }]}>
                      <Text style={styles.severityText}>
                        {symptom.severity || 'N/A'}/10
                      </Text>
                    </View>
                  </View>
                  <Paragraph style={styles.dateText}>
                    {symptom.timestamp ? formatDateTime(symptom.timestamp) : 'N/A'}
                  </Paragraph>
                  {symptom.details && (
                    <Paragraph style={styles.details}>{symptom.details}</Paragraph>
                  )}
                  {index < recentSymptoms.length - 1 && <Divider style={styles.itemDivider} />}
                </View>
              ))
            ) : (
              <View style={styles.emptyStateContainer}>
                <Ionicons name="medical-outline" size={48} color={theme.colors.disabled} />
                <Text style={styles.noDataMessage}>No symptoms recorded yet</Text>
                <Button 
                  mode="contained" 
                  onPress={() => navigation.navigate('Symptoms')}
                  style={styles.emptyStateButton}
                >
                  Log a symptom
                </Button>
              </View>
            )}
          </Card.Content>
        </Card>
      </View>

      <View>
        <Card style={theme.defaultCardStyle}>
          <Card.Content>
            <Title style={styles.sectionTitle}>Your Medications</Title>
            {medications.length > 0 ? (
              medications.map((med, index) => {
                const status = getMedicationStatus(med._id);
                const statusUpdateTime = getMedicationStatusUpdateTime(med._id);
                return (
                  <View 
                    key={med._id} 
                    style={[
                      styles.medicationItem,
                      status === 'taken' && styles.medicationItemTaken,
                      status === 'not_taken' && styles.medicationItemNotTaken
                    ]}
                  >
                    <Title style={styles.medicationName}>{med.name || 'Unnamed Medication'}</Title>
                    <View style={styles.medicationDetails}>
                      <Chip icon="repeat" style={styles.medicationChip}>
                        {med.frequency} times per day
                      </Chip>
                      {med.times && med.times.length > 0 && (
                        <Chip icon="clock" style={styles.medicationChip}>
                          {med.times.join(', ')}
                        </Chip>
                      )}
                      {/* Add status chip here */}
                      {status && (
                        <Chip 
                          icon={status === 'taken' ? 'check' : 'close'} 
                          style={[
                            styles.medicationChip,
                            { backgroundColor: getStatusColor(status) }
                          ]}
                        >
                          <Text style={styles.statusChipText}>
                            {status === 'taken' ? 'Taken' : 'Not Taken'}
                          </Text>
                        </Chip>
                      )}
                    </View>
                    {med.notes && <Paragraph style={styles.details}>Notes: {med.notes}</Paragraph>}
                    {statusUpdateTime && (
                      <View style={styles.statusTimeContainer}>
                        <Text style={styles.statusTimeText}>
                          Status updated: {formatDateTime(statusUpdateTime)}
                        </Text>
                      </View>
                    )}
                    {index < medications.length - 1 && <Divider style={styles.itemDivider} />}
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyStateContainer}>
                <Ionicons name="medkit-outline" size={48} color={theme.colors.disabled} />
                <Text style={styles.noDataMessage}>No medications added yet</Text>
                <Button 
                  mode="contained" 
                  onPress={() => navigation.navigate('Medications')}
                  style={styles.emptyStateButton}
                >
                  Add medication
                </Button>
              </View>
            )}
          </Card.Content>
        </Card>
      </View>

      <DatePickerModal
        locale="en"
        mode="range"
        visible={datePickerVisible}
        onDismiss={onDismissDatePicker}
        startDate={startDate}
        endDate={endDate}
        onConfirm={onConfirmDatePicker}
      />

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: theme.spacing.md,
  },
  header: {
    marginBottom: theme.spacing.md,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.roundness,
    padding: theme.spacing.md,
    ...theme.shadows.medium,
  },
  headerLogo: {
    width: 60,
    height: 60,
    marginRight: theme.spacing.md,
  },
  welcomeText: {
    ...theme.typography.medium,
    color: theme.colors.disabled,
  },
  appName: {
    ...theme.typography.h1,
    color: theme.colors.primary,
    letterSpacing: 1,
  },
  tagline: {
    ...theme.typography.body2,
    color: theme.colors.disabled,
  },
  searchSurface: {
    padding: theme.spacing.md,
    borderRadius: theme.roundness,
    marginBottom: theme.spacing.md,
    ...theme.shadows.small,
  },
  searchTitle: {
    ...theme.typography.h3,
    marginBottom: theme.spacing.sm,
    color: theme.colors.text,
  },
  searchBar: {
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    elevation: 0,
    borderWidth: 1,
    borderColor: theme.colors.divider,
  },
  dateFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  dateFilterButton: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.roundness / 2,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateFilterText: {
    ...theme.typography.body2,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  clearDateButton: {
    marginLeft: theme.spacing.sm,
    padding: theme.spacing.xs,
  },
  searchActionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchButton: {
    flex: 3,
    marginRight: theme.spacing.sm,
  },
  resetButton: {
    flex: 1,
    borderColor: theme.colors.primary,
  },
  errorText: {
    color: theme.colors.error,
    ...theme.typography.caption,
    marginTop: theme.spacing.sm,
  },
  searchResultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
  },
  resultCount: {
    backgroundColor: theme.colors.surface,
  },
  searchResult: {
    marginBottom: theme.spacing.sm,
  },
  resultDivider: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.divider,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  symptomItem: {
    marginBottom: theme.spacing.sm,
  },
  itemDivider: {
    marginVertical: theme.spacing.sm,
    backgroundColor: theme.colors.divider,
  },
  symptomName: {
    ...theme.typography.medium,
    fontSize: 16,
    flex: 1,
    marginBottom: theme.spacing.xs,
  },
  severityPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs / 2,
    borderRadius: 10,
    minWidth: 45,
    alignItems: 'center',
  },
  severityText: {
    color: 'white',
    ...theme.typography.bold,
    fontSize: 12,
  },
  dateText: {
    ...theme.typography.caption,
    color: theme.colors.disabled,
    marginBottom: theme.spacing.xs,
  },
  details: {
    ...theme.typography.body2,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  medicationItem: {
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.divider,
    paddingLeft: theme.spacing.sm,
  },
  medicationItemTaken: {
    borderLeftColor: theme.colors.success || '#4CAF50',
  },
  medicationItemNotTaken: {
    borderLeftColor: theme.colors.error,
  },
  medicationName: {
    ...theme.typography.medium,
    fontSize: 16,
    marginBottom: theme.spacing.xs,
  },
  medicationDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: theme.spacing.xs,
  },
  medicationChip: {
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
  },
  statusChipText: {
    color: '#fff',
    fontSize: 12,
  },
  statusTimeContainer: {
    marginTop: theme.spacing.xs,
  },
  statusTimeText: {
    ...theme.typography.caption,
    color: theme.colors.disabled,
    fontStyle: 'italic',
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
  noDataMessage: {
    ...theme.typography.body1,
    color: theme.colors.disabled,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  emptyStateButton: {
    marginTop: theme.spacing.md,
  },
  snackbar: {
    backgroundColor: theme.colors.error,
  },
});

export default HomeScreen;