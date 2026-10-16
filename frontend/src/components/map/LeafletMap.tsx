import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { buildLeafletHtml, MapPayload } from "./leafletHtml";

export type { MapMarker, MapPayload } from "./leafletHtml";

export type LeafletMapHandle = {
  /** Re-center on payload.center (or fit all markers when fitToMarkers is set). */
  recenter: () => void;
};

type Props = MapPayload & {
  style?: StyleProp<ViewStyle>;
  onMarkerPress?: (id: string | number) => void;
};

/**
 * Free, key-less map (Leaflet + OpenStreetMap tiles) rendered in a WebView.
 * Replaces react-native-maps, which crashes on Android builds without a Google Maps API key.
 */
const LeafletMap = forwardRef<LeafletMapHandle, Props>(function LeafletMap(
  { style, onMarkerPress, ...payload },
  ref
) {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Build the page once; later changes are pushed with injectJavaScript so the map keeps its zoom/pan.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildLeafletHtml(payload), []);
  const payloadJson = JSON.stringify(payload);
  const centerKey = `${payload.center.latitude.toFixed(5)},${payload.center.longitude.toFixed(5)}`;
  const lastCenterKey = useRef(centerKey);

  const push = (recenter: boolean) => {
    webRef.current?.injectJavaScript(
      `window.__ttUpdate && window.__ttUpdate(${payloadJson.replace(/</g, "\\u003c")}, ${recenter}); true;`
    );
  };

  useEffect(() => {
    if (!ready) return;
    const recenter = lastCenterKey.current !== centerKey;
    lastCenterKey.current = centerKey;
    push(recenter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadJson, ready]);

  useImperativeHandle(ref, () => ({ recenter: () => push(true) }), [payloadJson]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "ready") setReady(true);
      else if (msg.type === "markerPress") onMarkerPress?.(msg.id);
      else if (msg.type === "error") setFailed(true);
    } catch {
      // ignore malformed messages
    }
  };

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://trusttrip.app/" }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        nestedScrollEnabled
        onError={() => setFailed(true)}
        style={styles.webview}
      />
      {!ready && !failed && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color="#00C292" />
        </View>
      )}
      {failed && (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>Map could not load. Check your internet connection.</Text>
        </View>
      )}
    </View>
  );
});

export default LeafletMap;

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    color: "#475569",
    fontSize: 13,
    textAlign: "center",
  },
});
