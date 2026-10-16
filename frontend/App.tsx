import React from "react";
import AppNavigator from "./src/navigation/AppNavigator";
import ErrorBoundary from "./src/components/common/ErrorBoundary";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AppNavigator />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}