import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';

const API_URL = 'https://medbud.onrender.com/api/auth';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const user = await getCurrentUser();
      setUser(user);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  return { user, loading };
};

export const login = async (username, password) => {
  try {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const response = await axios({
      method: 'POST',
      url: `${API_URL}/login`,
      data: formData.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    const { access_token } = response.data;
    await AsyncStorage.setItem('token', access_token);
    console.log(access_token)
    return access_token;
  } catch (error) {
    throw error.response?.data || { detail: 'Failed to login' };
  }
};

export const register = async (username, email, password) => {
  try {
    const response = await axios.post(`${API_URL}/register`, {
      username,
      email,
      hashed_password: password,
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || { detail: 'Failed to register' };
  }
};

export const logout = async () => {
  await AsyncStorage.removeItem('token');
};

export const getCurrentUser = async () => {
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) return null;

    const response = await axios.get(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    await AsyncStorage.removeItem('token');
    return null;
  }
};


