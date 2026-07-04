import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0b0f14' },
          headerTintColor: '#f5f7fa',
          contentStyle: { backgroundColor: '#0b0f14' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="connect" options={{ title: 'Connect devices', presentation: 'modal' }} />
        <Stack.Screen name="preferences" options={{ title: 'Preferences', presentation: 'modal' }} />
        <Stack.Screen name="log-food" options={{ title: 'Log food', presentation: 'modal' }} />
      </Stack>
    </>
  );
}
