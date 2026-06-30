import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const TINT = '#3ddc97';
const INACTIVE = '#6c8094';
const BG = '#0b0f14';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: TINT,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: BG,
          borderTopColor: '#1c242e',
          borderTopWidth: 1,
        },
        headerStyle: { backgroundColor: BG },
        headerTitleStyle: { color: '#f5f7fa', fontWeight: '700' },
        headerTintColor: '#f5f7fa',
        sceneStyle: { backgroundColor: BG },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="sleep"
        options={{
          title: 'Sleep',
          tabBarIcon: ({ color, size }) => <Ionicons name="moon" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: 'Workouts',
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Coach',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
