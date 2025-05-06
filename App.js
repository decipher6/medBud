// App.js with proper user context and web notification support
import React, { useState, useEffect, createContext } from 'react';
import { StatusBar, View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Notification Handlers
import NotificationHandler from './src/components/NotificationHandler';
import WebNotificationHandler from './src/components/WebNotificationHandler';

// Screens
import SplashScreen from './src/screens/SplashScreen';
import HomeScreen from './src/screens/HomeScreen';
import SymptomScreen from './src/screens/SymptomScreen';
import MedicationScreen from './src/screens/MedicationScreen';
import ReportScreen from './src/screens/ReportScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';

// Services
import { getCurrentUser, logout } from './src/services/authService';

// Theme
import { theme } from './src/theme/theme';

// Medication Provider
import { MedicationProvider } from './src/context/MedicationContext';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Create enhanced user context
export const UserContext = createContext({
  user: null,
  setUser: () => {},
  getUserId: () => null,
});

// Custom header right component with logout button
function LogoutButton({ navigation }) {
  const { setUser } = React.useContext(UserContext);
  
  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      
      // Navigate back to Splash
      navigation.reset({
        index: 0,
        routes: [{ name: 'Splash' }],
      });
    } catch (error) {
      console.error('Error during logout:', error);
      // Show an error alert
      Alert.alert(
        'Logout Error',
        'There was a problem logging out. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };
  
  return (
    <TouchableOpacity 
      onPress={handleLogout} 
      style={{ marginRight: 16 }}
    >
      <Ionicons name="log-out-outline" size={24} color={theme.colors.primary} />
    </TouchableOpacity>
  );
}

// Custom header title component with username
function HeaderTitle({ title, username }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ 
        fontSize: 20, 
        fontWeight: '600', 
        color: theme.colors.text 
      }}>
        {title}
      </Text>
      {username && (
        <Text style={{ 
          fontSize: 14, 
          color: theme.colors.primary,
        }}>
          Welcome, {username}
        </Text>
      )}
    </View>
  );
}

// Main tab navigator
function MainApp() {
  const { user } = React.useContext(UserContext);
  
  return (
    <Tab.Navigator
      screenOptions={({ route, navigation }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Symptoms') {
            iconName = focused ? 'medical' : 'medical-outline';
          } else if (route.name === 'Medications') {
            iconName = focused ? 'medkit' : 'medkit-outline';
          } else if (route.name === 'Reports') {
            iconName = focused ? 'document-text' : 'document-text-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.disabled,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          marginBottom: 4,
        },
        tabBarStyle: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 3.0,
          elevation: 3,
          height: 60,
          paddingBottom: 6,
        },
        headerShown: true,
        headerTitleStyle: {
          fontSize: 20,
          fontWeight: '600',
          color: theme.colors.text,
        },
        headerStyle: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.18,
          shadowRadius: 1.0,
          elevation: 1,
          backgroundColor: theme.colors.background,
        },
        headerTitle: () => <HeaderTitle title={route.name} username={user?.username} />,
        headerRight: () => <LogoutButton navigation={navigation} />,
        headerTitleAlign: 'center',
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Symptoms" component={SymptomScreen} />
      <Tab.Screen name="Medications" component={MedicationScreen} />
      <Tab.Screen name="Reports" component={ReportScreen} />
    </Tab.Navigator>
  );
}

// Auth Stack
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Add getUserId function to properly get the current user ID
  const getUserId = () => {
    return user?.id || null;
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <UserContext.Provider value={{ user, setUser, getUserId }}>
      <MedicationProvider>
        <PaperProvider theme={theme}>
          <SafeAreaProvider>
            <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />
            <NavigationContainer theme={theme}>
              {Platform.OS === 'web' ? (
                <WebNotificationHandler />
              ) : (
                <NotificationHandler />
              )}
              <Stack.Navigator
                initialRouteName={user ? "MainApp" : "Splash"}
                screenOptions={{
                  headerShown: false,
                }}
              >
                <Stack.Screen name="Splash" component={SplashScreen} />
                <Stack.Screen name="Auth" component={AuthStack} />
                <Stack.Screen name="MainApp" component={MainApp} />
              </Stack.Navigator>
            </NavigationContainer>
          </SafeAreaProvider>
        </PaperProvider>
      </MedicationProvider>
    </UserContext.Provider>
  );
}