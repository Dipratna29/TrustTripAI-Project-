/**
 * Self-contained Leaflet page used by LeafletMap (WebView on Android/iOS, iframe on web).
 * Free tiles (CARTO Voyager on OpenStreetMap data) - no Google Maps API key or billing needed.
 */

export type MapMarker = {
  id: string | number;
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string;
  color?: string;
  /** Optional radius (meters) drawn as a translucent zone around the marker */
  radius?: number;
};

export type MapPayload = {
  center: { latitude: number; longitude: number };
  zoom?: number;
  markers: MapMarker[];
  user?: { latitude: number; longitude: number; accuracy?: number | null } | null;
  selectedId?: string | number | null;
  fitToMarkers?: boolean;
};

export function buildLeafletHtml(initial: MapPayload) {
  const json = JSON.stringify(initial).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: #E2E8F0; }
  .leaflet-control-attribution { font-size: 9px; }
  .tt-user { width: 16px; height: 16px; border-radius: 50%; background: #3B82F6; border: 3px solid #fff; box-shadow: 0 0 0 2px rgba(59,130,246,.35); }
  #err { display:none; position:absolute; inset:0; align-items:center; justify-content:center; font: 14px sans-serif; color:#475569; text-align:center; padding:24px; }
</style>
</head>
<body>
<div id="map"></div>
<div id="err">Map could not load. Check your internet connection.</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function () {
  function post(msg) {
    var data = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
    else if (window.parent) window.parent.postMessage(data, "*");
  }
  if (typeof L === "undefined") {
    document.getElementById("err").style.display = "flex";
    post({ type: "error", message: "leaflet-load-failed" });
    return;
  }
  var state = ${json};
  var map = L.map("map", { zoomControl: true, attributionControl: true })
    .setView([state.center.latitude, state.center.longitude], state.zoom || 14);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd",
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(map);

  var layer = L.layerGroup().addTo(map);
  var userLayer = L.layerGroup().addTo(map);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]; }); }

  function render(next, recenter) {
    layer.clearLayers();
    userLayer.clearLayers();
    var bounds = [];
    (next.markers || []).forEach(function (m) {
      if (typeof m.latitude !== "number" || typeof m.longitude !== "number") return;
      var color = m.color || "#00C292";
      var selected = next.selectedId != null && String(next.selectedId) === String(m.id);
      if (m.radius) {
        L.circle([m.latitude, m.longitude], { radius: m.radius, color: color, weight: 1, fillOpacity: 0.12 }).addTo(layer);
      }
      var marker = L.circleMarker([m.latitude, m.longitude], {
        radius: selected ? 12 : 9, color: "#ffffff", weight: 3, fillColor: color, fillOpacity: 1
      }).addTo(layer);
      marker.bindPopup("<b>" + esc(m.title) + "</b>" + (m.subtitle ? "<br/>" + esc(m.subtitle) : ""));
      marker.on("click", function () { post({ type: "markerPress", id: m.id }); });
      if (selected) marker.openPopup();
      bounds.push([m.latitude, m.longitude]);
    });
    if (next.user && typeof next.user.latitude === "number") {
      var u = [next.user.latitude, next.user.longitude];
      if (next.user.accuracy && next.user.accuracy < 2000) {
        L.circle(u, { radius: next.user.accuracy, color: "#3B82F6", weight: 1, fillOpacity: 0.1 }).addTo(userLayer);
      }
      L.marker(u, { icon: L.divIcon({ className: "", html: '<div class="tt-user"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }) })
        .bindPopup("You are here").addTo(userLayer);
      bounds.push(u);
    }
    if (recenter) {
      if (next.fitToMarkers && bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      else map.setView([next.center.latitude, next.center.longitude], next.zoom || map.getZoom());
    }
  }

  window.__ttUpdate = function (next, recenter) { state = next; render(next, recenter); };
  window.addEventListener("message", function (e) {
    try {
      var msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      if (msg && msg.type === "update") window.__ttUpdate(msg.payload, msg.recenter);
    } catch (err) {}
  });
  document.addEventListener("message", function (e) {
    try { var msg = JSON.parse(e.data); if (msg && msg.type === "update") window.__ttUpdate(msg.payload, msg.recenter); } catch (err) {}
  });

  render(state, true);
  post({ type: "ready" });
})();
</script>
</body>
</html>`;
}
