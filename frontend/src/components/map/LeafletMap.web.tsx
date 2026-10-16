import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { buildLeafletHtml, MapPayload } from "./leafletHtml";

export type { MapMarker, MapPayload } from "./leafletHtml";

export type LeafletMapHandle = { recenter: () => void };

type Props = MapPayload & {
  style?: StyleProp<ViewStyle>;
  onMarkerPress?: (id: string | number) => void;
};

/** Web build: same Leaflet page rendered in an iframe and driven with postMessage. */
const LeafletMap = forwardRef<LeafletMapHandle, Props>(function LeafletMap(
  { style, onMarkerPress, ...payload },
  ref
) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildLeafletHtml(payload), []);
  const payloadJson = JSON.stringify(payload);

  const push = (recenter: boolean) => {
    frameRef.current?.contentWindow?.postMessage(
      JSON.stringify({ type: "update", payload: JSON.parse(payloadJson), recenter }),
      "*"
    );
  };

  useEffect(() => {
    push(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadJson]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      try {
        const msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (msg?.type === "markerPress") onMarkerPress?.(msg.id);
      } catch {
        // ignore
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onMarkerPress]);

  useImperativeHandle(ref, () => ({ recenter: () => push(true) }), [payloadJson]);

  return (
    <View style={[{ overflow: "hidden", backgroundColor: "#E2E8F0" }, style]}>
      {React.createElement("iframe", {
        ref: frameRef,
        srcDoc: html,
        title: "Map",
        style: { border: 0, width: "100%", height: "100%" },
      })}
    </View>
  );
});

export default LeafletMap;
