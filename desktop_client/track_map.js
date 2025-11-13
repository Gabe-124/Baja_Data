/**
 * Track Map Module
 * 
 * Manages the Leaflet map display, shows car position, and draws the track path.
 */

class TrackMap {
  constructor(mapElementId) {
    // Initialize Leaflet map
    this.map = L.map(mapElementId, {
      center: [40.746193419041816, -74.02465026724094], // Default center (will update on first GPS fix)
      zoom: 18,
      zoomControl: true,
      attributionControl: false
    });

    // Create tile layers: street (default) and satellite (toggleable)
    this.streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    });

    // Satellite imagery (ESRI World Imagery) - internet required
    this.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'ESRI World Imagery'
    });

    // Start with street layer by default
    this.currentLayer = 'street';
    this.streetLayer.addTo(this.map);

    // Car marker (current position)
    this.carMarker = null;

    // Start/finish line marker
    this.startFinishMarker = null;
    this.startFinishCircle = null;

    // Track path (polyline of GPS points)
    this.trackPath = null;
    this.trackPoints = [];

    // Auto-centering flag
    this.autoCenter = true;

    // Custom car icon
    this.carIcon = L.divIcon({
      className: 'car-marker',
      html: '<div style="background: #00d4ff; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,212,255,0.8);"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    // Start/finish flag icon
    this.flagIcon = L.divIcon({
      className: 'flag-marker',
      html: '<div style="font-size: 24px;">🏁</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 24]
    });

    // Drawing layer for user-drawn or imported track (editable)
    this.drawLayer = L.featureGroup().addTo(this.map);

    // Initialize Leaflet.draw control (but do not add to map UI automatically)
    this.drawControl = new L.Control.Draw({
      draw: {
        polyline: {
          shapeOptions: { color: '#ffaa00', weight: 3 }
        },
        polygon: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false
      },
      edit: {
        featureGroup: this.drawLayer,
        edit: true,
        remove: true
      }
    });

    // Track editing state
    this._drawingEnabled = false;

    // Handle draw created events to add the drawn polyline to drawLayer
    this.map.on(L.Draw.Event.CREATED, (e) => {
      const layer = e.layer;
      // Remove any existing drawn track (we keep a single canonical track)
      this.drawLayer.clearLayers();
      this.drawLayer.addLayer(layer);
      // Also visually add to map as reference
      layer.addTo(this.map);
    });

    // When edited, keep the drawLayer up-to-date
    this.map.on(L.Draw.Event.EDITED, (e) => {
      // Nothing special required; drawLayer is already updated
    });
  }

  /**
   * Update car position on the map
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   */
  updateCarPosition(lat, lon) {
    if (!this.carMarker) {
      // Create marker on first position
      this.carMarker = L.marker([lat, lon], { icon: this.carIcon }).addTo(this.map);
      
      // Center map on first fix
      this.map.setView([lat, lon], 18);
    } else {
      // Update existing marker
      this.carMarker.setLatLng([lat, lon]);
    }

    // Add point to track path
    this.trackPoints.push([lat, lon]);

    // Update or create track polyline
    if (!this.trackPath) {
      this.trackPath = L.polyline(this.trackPoints, {
        color: '#00d4ff',
        weight: 3,
        opacity: 0.7,
        smoothFactor: 1
      }).addTo(this.map);
    } else {
      this.trackPath.setLatLngs(this.trackPoints);
    }

    // Auto-center map if enabled
    if (this.autoCenter) {
      this.map.panTo([lat, lon], { animate: true, duration: 0.5 });
    }
  }

  /**
   * Toggle between street tile layer and satellite imagery.
   * @returns {string} New layer name ('street' or 'satellite')
   */
  toggleMapType() {
    if (this.currentLayer === 'street') {
      // switch to satellite
      this.map.removeLayer(this.streetLayer);
      this.satelliteLayer.addTo(this.map);
      this.currentLayer = 'satellite';
    } else {
      // switch to street
      this.map.removeLayer(this.satelliteLayer);
      this.streetLayer.addTo(this.map);
      this.currentLayer = 'street';
    }
    return this.currentLayer;
  }

  /**
   * Set map type explicitly
   * @param {string} type - 'street' or 'satellite'
   */
  setMapType(type) {
    if (type === 'satellite' && this.currentLayer !== 'satellite') {
      this.map.removeLayer(this.streetLayer);
      this.satelliteLayer.addTo(this.map);
      this.currentLayer = 'satellite';
    } else if (type === 'street' && this.currentLayer !== 'street') {
      this.map.removeLayer(this.satelliteLayer);
      this.streetLayer.addTo(this.map);
      this.currentLayer = 'street';
    }
  }

  /**
   * Set the start/finish line location and show marker
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {number} radius - Geofence radius in meters
   */
  setStartFinishLine(lat, lon, radius = 10) {
    // Remove existing markers
    if (this.startFinishMarker) {
      this.map.removeLayer(this.startFinishMarker);
    }
    if (this.startFinishCircle) {
      this.map.removeLayer(this.startFinishCircle);
    }

    // Add flag marker
    this.startFinishMarker = L.marker([lat, lon], { icon: this.flagIcon })
      .addTo(this.map)
      .bindPopup('Start/Finish Line');

    // Add detection radius circle
    this.startFinishCircle = L.circle([lat, lon], {
      radius: radius,
      color: '#00ff88',
      fillColor: '#00ff88',
      fillOpacity: 0.1,
      weight: 2
    }).addTo(this.map);
  }

  /**
   * Center the map on the car's current position
   */
  centerOnCar() {
    if (this.carMarker) {
      const pos = this.carMarker.getLatLng();
      this.map.setView(pos, this.map.getZoom(), { animate: true });
    }
  }

  /**
   * Toggle auto-centering on/off
   * @param {boolean} enabled - Whether to enable auto-centering
   */
  setAutoCenter(enabled) {
    this.autoCenter = enabled;
  }

  /**
   * Clear the track path (keeps car marker)
   */
  clearTrack() {
    this.trackPoints = [];
    if (this.trackPath) {
      this.map.removeLayer(this.trackPath);
      this.trackPath = null;
    }
  }

  /**
   * Reset the entire map (clear everything)
   */
  reset() {
    this.clearTrack();
    
    if (this.carMarker) {
      this.map.removeLayer(this.carMarker);
      this.carMarker = null;
    }

    if (this.startFinishMarker) {
      this.map.removeLayer(this.startFinishMarker);
      this.startFinishMarker = null;
    }

    if (this.startFinishCircle) {
      this.map.removeLayer(this.startFinishCircle);
      this.startFinishCircle = null;
    }
  }

  /**
   * Fit map view to show the entire track
   */
  fitTrack() {
    if (this.trackPoints.length > 0) {
      const bounds = L.latLngBounds(this.trackPoints);
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  /**
   * Export track path as GeoJSON
   * @returns {Object} GeoJSON object
   */
  exportTrackGeoJSON() {
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: this.trackPoints.map(point => [point[1], point[0]]) // [lon, lat] for GeoJSON
      },
      properties: {
        name: 'Baja Track',
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Import and display a track from GeoJSON
   * @param {Object} geojson - GeoJSON object with LineString geometry
   */
  importTrackGeoJSON(geojson) {
    try {
      // Accept either Feature or raw geometry
      let geom = null;
      if (geojson.type === 'Feature' && geojson.geometry) geom = geojson.geometry;
      else if (geojson.type === 'FeatureCollection' && geojson.features && geojson.features.length) geom = geojson.features[0].geometry;
      else if (geojson.type === 'LineString' || geojson.type === 'MultiLineString') geom = geojson;

      if (!geom) {
        console.warn('Unsupported GeoJSON format for import');
        return;
      }

      // Support LineString and MultiLineString by flattening into a single point list
      let coords = [];
      if (geom.type === 'LineString') {
        coords = geom.coordinates;
      } else if (geom.type === 'MultiLineString') {
        coords = geom.coordinates.flat();
      }

      if (coords.length === 0) return;

      const points = coords.map(coord => [coord[1], coord[0]]);

      // Clear existing drawn track and add imported track to drawLayer (editable)
      this.drawLayer.clearLayers();
      const imported = L.polyline(points, {
        color: '#ffaa00',
        weight: 3,
        opacity: 0.9
      });
      this.drawLayer.addLayer(imported);
      imported.addTo(this.map);

      // Fit map to imported track
      const bounds = L.latLngBounds(points);
      this.map.fitBounds(bounds, { padding: [50, 50] });
    } catch (error) {
      console.error('Failed to import track:', error);
    }
  }

  /**
   * Enable drawing mode so the user can draw a track
   */
  enableDrawing() {
    if (this._drawingEnabled) return;
    this.map.addControl(this.drawControl);
    this._drawingEnabled = true;
  }

  /**
   * Disable drawing mode
   */
  disableDrawing() {
    if (!this._drawingEnabled) return;
    try {
      this.map.removeControl(this.drawControl);
    } catch (e) {
      // ignore
    }
    this._drawingEnabled = false;
  }

  /**
   * Return the currently drawn track as GeoJSON (LineString)
   */
  getDrawnTrackGeoJSON() {
    // If drawLayer has a polyline, export its coordinates; otherwise return null
    const layers = this.drawLayer.getLayers();
    if (!layers || layers.length === 0) return null;
    // Prefer the first layer
    const layer = layers[0];
    if (layer.toGeoJSON) {
      return layer.toGeoJSON();
    }
    return null;
  }
}
