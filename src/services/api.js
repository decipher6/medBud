const BASE_URL = 'https://medbud.onrender.com';

export const api = {
  // Symptoms
  async createSymptom(symptomData, user_id) {
    const response = await fetch(`${BASE_URL}/api/symptoms?user_id=${user_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(symptomData),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }
    
    return data;
  },

  async getSymptoms(userId, skip = 0, limit = 100) {
    if (!userId) {
      console.error('Missing userId in getSymptoms call');
      return []; // Return empty array if no userId
    }
    
    const response = await fetch(`${BASE_URL}/api/symptoms/${userId}?skip=${skip}&limit=${limit}`);
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }
    
    return data;
  },

  // Medications
  async createMedication(medicationData) {
    const response = await fetch(`${BASE_URL}/api/medications/?user_id=${medicationData.user_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(medicationData),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }
    
    return data;
  },

  async getMedications(userId) {
    if (!userId) {
      console.error('Missing userId in getMedications call');
      return []; // Return empty array if no userId
    }
    
    const response = await fetch(`${BASE_URL}/api/medications/${userId}`);
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }
    
    return data;
  },

  async updateMedication(medicationId, medicationData, userId) {
    const response = await fetch(`${BASE_URL}/api/medications/${medicationId}?user_id=${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(medicationData),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }
    
    return data;
  },

  async deleteMedication(medicationId, userId) {
    const response = await fetch(`${BASE_URL}/api/medications/${medicationId}?user_id=${userId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }
    
    return true;
  },

  async incrementMedicationAdherence(medicationId) {
    const response = await fetch(`${BASE_URL}/api/medications/increment-adherence?medication_id=${medicationId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }
    
    return data;
  },

  // Reports
  async generateReport(userId, startDate = null, endDate = null, format = 'summary') {
    let url = `${BASE_URL}/api/reports/${userId}`;
    
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    params.append('report_format', format);
  
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
  
    const response = await fetch(url);
  
    if (!response.ok) {
      let message = `HTTP error! status: ${response.status}`;
      try {
        const data = await response.json();
        message = data.detail || data.message || message;
      } catch (_) {
        // response body might not be JSON
      }
  
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
  
    // return text (not JSON) for summary report
    if (format === 'pdf') {
      return await response.blob();
    }
    return await response.text();
  },

  async generatePdfReport(userId, startDate = null, endDate = null) {
    let url = `${BASE_URL}/api/reports/${userId}`;
    
    // Add date range parameters if provided
    const params = new URLSearchParams();
    if (startDate) {
      params.append('start_date', startDate);
    }
    if (endDate) {
      params.append('end_date', endDate);
    }
    
    // Append parameters to URL if any exist
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await fetch(url);
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }
    
    // The API returns a string with the report content
    const data = await response.text();
    return data;
  },

  // Users
  async createUser(userData) {
    const response = await fetch(`${BASE_URL}/api/users/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });
    return response.json();
  },

  async getUsers() {
    const response = await fetch(`${BASE_URL}/api/users/`);
    return response.json();
  },

  async getUser(userId) {
    const response = await fetch(`${BASE_URL}/api/users/${userId}`);
    return response.json();
  },
}; 