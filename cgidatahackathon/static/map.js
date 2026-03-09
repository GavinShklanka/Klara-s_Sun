/**
 * KLARA OS — Map visualization for Nova Scotia healthcare infrastructure and care sequences.
 * Uses Mapbox GL JS and deck.gl. Reads existing API: /api/ns-healthcare-nodes, assess response (care_sequence).
 * Backend routing contract unchanged (primary_pathway, options, care_sequence, optimizer).
 */

(function (global) {
    'use strict';

    var NODE_COLORS = {
        hospital: [220, 53, 69],           // red
        lab: [13, 110, 253],               // blue
        pharmacy: [25, 135, 84],            // green
        community_health: [111, 66, 193],  // purple
        telehealth: [253, 126, 20],        // orange
        mental_health: [214, 51, 132],    // pink
        primary_care: [32, 201, 151],      // teal
        imaging: [102, 126, 234],          // indigo
        specialist: [253, 151, 31],        // amber
        transport: [108, 117, 125]         // gray
    };

    var DEFAULT_COLOR = [108, 117, 125];

    function colorForType(type) {
        return NODE_COLORS[type] || DEFAULT_COLOR;
    }

    var NS_CENTER = [-63.5752, 44.6488];
    var DEFAULT_ZOOM = 6;

    var mapboxMap = null;
    var deckOverlay = null;
    var nodesById = {};
    var nodesArray = [];
    var currentCareSequence = [];
    var demandClustersData = [];
    var visibleNodeTypes = null; // null = show all; else array of type strings
    var pressureData = [];       // { position: [lon, lat], weight } for heatmap

    function loadNodes() {
        return fetch('/api/ns-healthcare-nodes')
            .then(function (r) { return r.ok ? r.json() : { nodes: [] }; })
            .then(function (data) {
                var nodes = data.nodes || [];
                nodesById = {};
                nodesArray = nodes.map(function (n) {
                    var id = n.id;
                    nodesById[id] = n;
                    return {
                        id: id,
                        name: n.name,
                        type: n.type || 'unknown',
                        position: [n.lon, n.lat],
                        lat: n.lat,
                        lon: n.lon,
                        region: n.region,
                        color: colorForType(n.type)
                    };
                });
                return nodesArray;
            });
    }

    function careSequenceToPath(careSequence) {
        if (!careSequence || !careSequence.length) return null;
        var path = [];
        for (var i = 0; i < careSequence.length; i++) {
            var node = nodesById[careSequence[i]];
            if (node && node.lon != null && node.lat != null) {
                path.push([node.lon, node.lat]);
            }
        }
        return path.length >= 2 ? path : null;
    }

    function getVisibleNodes() {
        if (!visibleNodeTypes || !visibleNodeTypes.length) return nodesArray;
        var set = {};
        visibleNodeTypes.forEach(function (t) { set[t] = true; });
        return nodesArray.filter(function (n) { return set[n.type]; });
    }

    function buildLayers() {
        var layers = [];
        var visible = getVisibleNodes();

        if (pressureData && pressureData.length && typeof deck.HeatmapLayer === 'function') {
            layers.push(new deck.HeatmapLayer({
                id: 'demand-pressure-heatmap',
                data: pressureData,
                getPosition: function (d) { return d.position; },
                getWeight: function (d) { return d.weight; },
                radiusPixels: 60,
                intensity: 1,
                threshold: 0.05
            }));
        } else if (pressureData && pressureData.length) {
            layers.push(new deck.ScatterplotLayer({
                id: 'demand-pressure-dots',
                data: pressureData,
                getPosition: function (d) { return d.position; },
                getColor: [255, 140, 0, 140],
                getRadius: 400,
                radiusMinPixels: 8,
                radiusMaxPixels: 24,
                pickable: true
            }));
        }

        if (visible.length) {
            layers.push(new deck.ScatterplotLayer({
                id: 'ns-healthcare-nodes',
                data: visible,
                getPosition: function (d) { return d.position; },
                getColor: function (d) { return d.color; },
                getRadius: 400,
                radiusMinPixels: 4,
                radiusMaxPixels: 14,
                pickable: true
            }));
        }

        var path = careSequenceToPath(currentCareSequence);
        if (path) {
            layers.push(new deck.PathLayer({
                id: 'care-sequence-route',
                data: [{ path: path }],
                getPath: function (d) { return d.path; },
                getColor: [0, 180, 216],
                getWidth: 3,
                widthMinPixels: 2,
                widthMaxPixels: 8,
                capRounded: true,
                joinRounded: true
            }));
        }

        if (demandClustersData && demandClustersData.length) {
            layers.push(new deck.ScatterplotLayer({
                id: 'future-demand-clusters',
                data: demandClustersData,
                getPosition: function (d) { return d.position || [d.lon, d.lat]; },
                getColor: [255, 193, 7, 180],
                getRadius: 800,
                radiusMinPixels: 6,
                radiusMaxPixels: 20,
                pickable: true
            }));
        }

        return layers;
    }

    function init(containerId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return Promise.reject(new Error('Map container not found: ' + containerId));

        return loadNodes().then(function () {
            return fetch('/api/config').then(function (r) { return r.ok ? r.json() : {}; }).then(function (config) {
                var token = options.mapboxToken || config.mapbox_access_token || '';

                var viewState = {
                    longitude: NS_CENTER[0],
                    latitude: NS_CENTER[1],
                    zoom: options.zoom != null ? options.zoom : DEFAULT_ZOOM,
                    pitch: 0,
                    bearing: 0
                };

                if (token && typeof mapboxgl !== 'undefined' && mapboxgl.Map) {
                    mapboxgl.accessToken = token;
                    mapboxMap = new mapboxgl.Map({
                        container: containerId,
                        style: 'mapbox://styles/mapbox/light-v11',
                        center: [NS_CENTER[0], NS_CENTER[1]],
                        zoom: DEFAULT_ZOOM
                    });
                    mapboxMap.on('load', function () {
                        if (deck.deck && mapboxMap) {
                            deckOverlay = new deck.MapboxOverlay({
                                interleaved: true,
                                layers: buildLayers()
                            });
                            mapboxMap.addControl(deckOverlay);
                        }
                    });
                } else {
                    container.innerHTML = '';
                    var canvasDiv = document.createElement('div');
                    canvasDiv.id = containerId + '-deck-container';
                    canvasDiv.style.width = '100%';
                    canvasDiv.style.height = '100%';
                    canvasDiv.style.background = '#e9ecef';
                    container.appendChild(canvasDiv);
                    if (typeof deck !== 'undefined' && deck.Deck) {
                        deckOverlay = new deck.Deck({
                            canvas: canvasDiv,
                            initialViewState: viewState,
                            controller: true,
                            layers: buildLayers(),
                            getTooltip: function (info) {
                                if (info.object && info.object.name) return info.object.name;
                                return null;
                            }
                        });
                    }
                }
                return { nodes: nodesArray, nodesById: nodesById };
            });
        });
    }

    function updateCareSequence(careSequence) {
        currentCareSequence = careSequence || [];
        if (deckOverlay && deckOverlay.setProps) {
            deckOverlay.setProps({ layers: buildLayers() });
        } else if (deckOverlay && mapboxMap) {
            deckOverlay.setProps({ layers: buildLayers() });
        }
    }

    function setDemandClusters(data) {
        demandClustersData = data || [];
        if (deckOverlay && deckOverlay.setProps) {
            deckOverlay.setProps({ layers: buildLayers() });
        } else if (deckOverlay && mapboxMap) {
            deckOverlay.setProps({ layers: buildLayers() });
        }
    }

    function setVisibleNodeTypes(types) {
        visibleNodeTypes = types && types.length ? types : null;
        if (deckOverlay && deckOverlay.setProps) {
            deckOverlay.setProps({ layers: buildLayers() });
        } else if (deckOverlay && mapboxMap) {
            deckOverlay.setProps({ layers: buildLayers() });
        }
    }

    function setPressureData(data) {
        pressureData = data || [];
        if (deckOverlay && deckOverlay.setProps) {
            deckOverlay.setProps({ layers: buildLayers() });
        } else if (deckOverlay && mapboxMap) {
            deckOverlay.setProps({ layers: buildLayers() });
        }
    }

    function fitBoundsToCareSequence(careSequence) {
        if (!careSequence || !careSequence.length) return;
        var lons = [];
        var lats = [];
        for (var i = 0; i < careSequence.length; i++) {
            var node = nodesById[careSequence[i]];
            if (node && node.lon != null && node.lat != null) {
                lons.push(node.lon);
                lats.push(node.lat);
            }
        }
        if (lons.length === 0) return;
        var minLon = Math.min.apply(null, lons);
        var maxLon = Math.max.apply(null, lons);
        var minLat = Math.min.apply(null, lats);
        var maxLat = Math.max.apply(null, lats);
        var pad = 0.15;
        var dLon = (maxLon - minLon) || 0.5;
        var dLat = (maxLat - minLat) || 0.5;
        var bounds = [[minLon - pad * dLon, minLat - pad * dLat], [maxLon + pad * dLon, maxLat + pad * dLat]];
        if (mapboxMap && typeof mapboxMap.fitBounds === 'function') {
            mapboxMap.fitBounds(bounds, { padding: 40, maxZoom: 12, duration: 800 });
        } else if (deckOverlay && typeof deckOverlay.setProps === 'function') {
            var centerLon = (minLon + maxLon) / 2;
            var centerLat = (minLat + maxLat) / 2;
            var zoom = Math.min(12, 10 - Math.log2(Math.max(dLon, dLat) * 2));
            deckOverlay.setProps({
                viewState: {
                    longitude: centerLon,
                    latitude: centerLat,
                    zoom: zoom,
                    pitch: 0,
                    bearing: 0
                }
            });
        }
    }

    function getNodesById() {
        return nodesById;
    }

    function getNodes() {
        return nodesArray;
    }

    global.KlaraMap = {
        init: init,
        updateCareSequence: updateCareSequence,
        setDemandClusters: setDemandClusters,
        setVisibleNodeTypes: setVisibleNodeTypes,
        setPressureData: setPressureData,
        fitBoundsToCareSequence: fitBoundsToCareSequence,
        getNodesById: getNodesById,
        getNodes: getNodes,
        NODE_COLORS: NODE_COLORS,
        colorForType: colorForType
    };
})(typeof window !== 'undefined' ? window : this);
