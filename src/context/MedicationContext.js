import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MedicationContext = createContext();

export function MedicationProvider({ children }) {
  const [medicationStatuses, setMedicationStatuses] = useState({});

  // Load saved statuses when the app starts
  useEffect(() => {
    loadSavedStatuses();
  }, []);

  const loadSavedStatuses = async () => {
    try {
      const savedStatuses = await AsyncStorage.getItem('medication_statuses');
      if (savedStatuses) {
        setMedicationStatuses(JSON.parse(savedStatuses));
      }
    } catch (error) {
      console.error('Error loading medication statuses:', error);
    }
  };

  const updateMedicationStatus = async (medicationId, status) => {
    try {
      const newStatuses = {
        ...medicationStatuses,
        [medicationId]: {
          status,
          updatedAt: new Date().toISOString()
        }
      };
      
      // Update state
      setMedicationStatuses(newStatuses);
      
      // Save to AsyncStorage
      await AsyncStorage.setItem('medication_statuses', JSON.stringify(newStatuses));
      
      return true;
    } catch (error) {
      console.error('Error updating medication status:', error);
      return false;
    }
  };

  return (
    <MedicationContext.Provider value={{ medicationStatuses, updateMedicationStatus }}>
      {children}
    </MedicationContext.Provider>
  );
}

export function useMedication() {
  const context = useContext(MedicationContext);
  if (!context) {
    throw new Error('useMedication must be used within a MedicationProvider');
  }
  return context;
} 