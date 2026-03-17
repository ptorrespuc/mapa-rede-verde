import "react-native-reanimated";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

import { AppProvider } from "@/src/providers/app-provider";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <Stack
            screenOptions={{
              contentStyle: {
                backgroundColor: "#f4f3ed",
              },
              headerStyle: {
                backgroundColor: "#ffffff",
              },
              headerShadowVisible: false,
              headerTintColor: "#15221b",
              headerTitleStyle: {
                fontWeight: "700",
              },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ title: "Entrar" }} />
            <Stack.Screen name="points/[id]" options={{ title: "Detalhe do ponto" }} />
            <Stack.Screen name="points/[id]/edit" options={{ title: "Editar ponto" }} />
          </Stack>
          <StatusBar style="dark" />
          <Toast />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
