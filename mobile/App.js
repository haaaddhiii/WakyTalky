import React from 'react';
import { StyleSheet, SafeAreaView, Platform, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';

// Your WakyTalky website URL
const WEBSITE_URL = 'https://wakytalky.vercel.app';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#faf8f5" />
      <WebView
        source={{ uri: WEBSITE_URL }}
        style={styles.webview}
        // Enable JavaScript
        javaScriptEnabled={true}
        // Enable DOM storage (needed for localStorage)
        domStorageEnabled={true}
        // Allow file access
        allowFileAccess={true}
        // Allow mixed content (if needed)
        mixedContentMode="compatibility"
        // Start loading immediately
        startInLoadingState={true}
        // Allow inline media playback
        allowsInlineMediaPlayback={true}
        // Media playback requires user action
        mediaPlaybackRequiresUserAction={false}
        // Zoom settings
        scalesPageToFit={true}
        // Modern WebKit settings
        sharedCookiesEnabled={true}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#faf8f5',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  webview: {
    flex: 1,
  },
});
