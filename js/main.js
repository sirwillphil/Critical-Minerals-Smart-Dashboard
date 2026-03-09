mapboxgl.accessToken =
  "pk.eyJ1IjoibGlhbnM3NyIsImEiOiJjbWt6NGxhMjcwZTJsM2Vwd2RtbWVvZHRuIn0.HDVAEM1yBC3D51XX3B4NPw";

const DEFAULT_VIEW = { center: [9, 20], zoom: 1 };

const MAP_ANIMATION = {
  fitPadding: 60,
  fitDuration: 1200,
  searchDuration: 1400,
  resetDuration: 1000,
  resizeDelay: 280,
  countryZoom: 4
};

const IDS = {
  sources: {
    countries: "countries",
    minerals: "minerals"
  },
  layers: {
    countryOutline: "country-outline",
    countryHighlight: "country-highlight",
    mineralPoints: "mineral-points"
  }
};

const COUNTRY_BASE_FILTER = [
  "all",
  ["==", ["get", "disputed"], "false"],
  [
    "any",
    ["==", "all", ["get", "worldview"]],
    ["in", "US", ["get", "worldview"]]
  ]
];

/** Trim and normalize any input into a safe string. */
function normalize(str) {
  return String(str || "").trim();
}

/** Attach an event listener only if the element exists. */
function on(el, event, handler) {
  if (el) el.addEventListener(event, handler);
}

document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("top");

  const infoBtn = document.getElementById("infoJumpBtn");
  const backBtn = document.getElementById("backToMapBtn");
  const infoPage = document.getElementById("infoPage");

  const statCountry = document.getElementById("statCountry");
  const statISO = document.getElementById("statISO");

  const input = document.getElementById("countrySearch");
  const searchBtn = document.getElementById("countrySearchBtn");
  const resetBtn = document.getElementById("resetBtn");

  const mineralSelect = document.getElementById("mineralSelect");
  const yearSelect = document.getElementById("yearSelect");
  const metricSelect = document.getElementById("metricSelect");

  const toggleLabelsBtn = document.getElementById("toggleLabels");

  const filterPanel = document.getElementById("filterPanel");
  const chartPanel = document.getElementById("chartPanel");
  const filterToggle = document.getElementById("filterToggle");
  const chartToggle = document.getElementById("chartToggle");

  const map = new mapboxgl.Map({
    container: "mapDiv",
    style: "mapbox://styles/mapbox/dark-v10",
    projection: "mercator",
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    minZoom: 1,
    maxZoom: 9
  });

  let symbolsHidden = false;

  /** Update the selected country text in the side panel. */
  function setSelectionUI({ name = "—", iso2 = "—" } = {}) {
    if (statCountry) statCountry.textContent = name;
    if (statISO) statISO.textContent = iso2;
  }

  /** Scroll the page to a target element. */
  function scrollToEl(el) {
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Fit the map view to a [minX, minY, maxX, maxY] bounding box. */
  function fitToBBox(bbox, duration = MAP_ANIMATION.fitDuration) {
    if (!Array.isArray(bbox) || bbox.length !== 4) return;

    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]]
      ],
      {
        padding: MAP_ANIMATION.fitPadding,
        duration
      }
    );
  }

  /** Apply or clear the highlighted country boundary by ISO2 code. */
  function applyCountryHighlight(iso2 = "") {
    if (!map.getLayer(IDS.layers.countryHighlight)) return;

    const code = iso2.toUpperCase();
    const filter = code
      ? [...COUNTRY_BASE_FILTER, ["==", ["get", "iso_3166_1"], code]]
      : ["==", ["get", "iso_3166_1"], ""];

    map.setFilter(IDS.layers.countryHighlight, filter);
  }

  /** Fetch a country result from Mapbox geocoding. */
  async function geocodeCountry(countryName) {
    const q = normalize(countryName);
    if (!q) return null;

    const url =
      "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
      encodeURIComponent(q) +
      ".json" +
      `?types=country&limit=1&access_token=${encodeURIComponent(mapboxgl.accessToken)}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const json = await res.json();
    const feature = json?.features?.[0];
    if (!feature) return null;

    return {
      name: feature?.text || feature?.place_name || q,
      iso2: (feature?.properties?.short_code || "").toUpperCase(),
      bbox: feature?.bbox,
      center: feature?.center
    };
  }

  /** Zoom to a geocoded country result and update the UI. */
  function zoomToCountryResult(result) {
    if (!result) return;

    const { name, iso2, bbox, center } = result;

    if (Array.isArray(bbox) && bbox.length === 4) {
      fitToBBox(bbox, MAP_ANIMATION.searchDuration);
    } else if (Array.isArray(center) && center.length === 2) {
      map.flyTo({
        center,
        zoom: MAP_ANIMATION.countryZoom,
        duration: MAP_ANIMATION.searchDuration
      });
    }

    const countryFiltered = allMineralData.filter(f =>
      f.country?.toLowerCase() === name.toLowerCase()
    );

    createChart(countryFiltered, "country");

    map.setFilter(IDS.layers.mineralPoints, ["==", ["downcase", ["get", "country"]], name.toLowerCase()]);

    setSelectionUI({ name, iso2: iso2 || "—" });
    if (iso2) applyCountryHighlight(iso2);
  }

  /** Search for a country name entered by the user. */
  async function handleCountrySearch() {
    const query = normalize(input?.value);
    if (!query) return alert("Type a country name (example: Chile).");

    const result = await geocodeCountry(query);
    if (!result) {
      return alert("Country not found. Try another spelling.\nTip: enter a country name only.");
    }

    zoomToCountryResult(result);
  }

  /** Reset UI selections, filters, and map view to defaults. */
  function resetAll() {
    resetMineralsToAll?.();
    resetUseCasesToAll?.();

    if (input) input.value = "";
    setSelectionUI();
    applyCountryHighlight("");

    map.setFilter(IDS.layers.mineralPoints, null);

    map.flyTo({
      ...DEFAULT_VIEW,
      duration: MAP_ANIMATION.resetDuration
    });
  }

  /** Update the toggle button glyph and app collapsed class for a panel. */
  function updatePanelToggle(panel, toggle, collapsedClass, collapsedGlyph, expandedGlyph) {
    if (!panel || !toggle) return;

    const collapsed = panel.classList.contains("collapsed");
    toggle.textContent = collapsed ? collapsedGlyph : expandedGlyph;
    app?.classList.toggle(collapsedClass, collapsed);
  }

  /** Refresh the visible glyphs for both side panels. */
  function setToggleGlyphs() {
    updatePanelToggle(filterPanel, filterToggle, "left-collapsed", "▶", "◀");
    updatePanelToggle(chartPanel, chartToggle, "right-collapsed", "◀", "▶");
  }

  /** Resize the map after layout-changing UI transitions. */
  function resizeMapSoon() {
    setTimeout(() => map.resize(), MAP_ANIMATION.resizeDelay);
  }

  /** Toggle a side panel and then refresh the layout. */
  function togglePanel(panel) {
    panel?.classList.toggle("collapsed");
    setToggleGlyphs();
    resizeMapSoon();
  }

  /** Hide or show all symbol layers on the current map style. */
  function setSymbolsHidden(hidden) {
    const opacity = hidden ? 0 : 1;
    const layers = map.getStyle()?.layers;
    if (!Array.isArray(layers)) return;

    for (const { id, type } of layers) {
      if (type !== "symbol" || !map.getLayer(id)) continue;
      try {
        map.setPaintProperty(id, "text-opacity", opacity);
      } catch {}
      try {
        map.setPaintProperty(id, "icon-opacity", opacity);
      } catch {}
    }

    symbolsHidden = hidden;
    if (toggleLabelsBtn) {
      toggleLabelsBtn.textContent = hidden ? "Show Labels" : "Hide Labels";
    }
  }

  /** Build "all vs specific" checkbox behavior for a filter group. */
  function setupCheckboxGroup(groupName, allId) {
    const allBox = document.getElementById(allId);
    if (!allBox) return;

    const boxes = [...document.querySelectorAll(`input[type="checkbox"][name="${groupName}"]`)]
      .filter((box) => box !== allBox);

    const setAllChecked = () => {
      allBox.checked = true;
      boxes.forEach((box) => {
        box.checked = false;
      });
    };

    const ensureNotEmpty = () => {
      if (!boxes.some((box) => box.checked)) setAllChecked();
    };

    on(allBox, "change", () => {
      if (allBox.checked) {
        boxes.forEach((box) => {
          box.checked = false;
        });
      } else {
        ensureNotEmpty();
      }
    });

    boxes.forEach((box) => {
      on(box, "change", () => {
        if (box.checked) allBox.checked = false;
        ensureNotEmpty();
      });
    });

    return setAllChecked;
  }

  const allCheckboxes = document.querySelectorAll('input[type="checkbox"][name="mineral"], input[type="checkbox"][name="useCase"]');
  allCheckboxes.forEach(box => {
    on(box, "change", () => setTimeout(() => renderCharts(allMineralData), 0));
  });

  /** Extract a readable country name and ISO2 code from a map feature. */
  function getCountryFeatureInfo(feature) {
    const props = feature?.properties || {};
    return {
      name: props.name_en || props.name || "Country",
      iso2: (props.iso_3166_1 || "").toUpperCase()
    };
  }

  /** Build popup HTML for a clicked country. */
  function buildCountryPopupHTML(name, iso2) {
    return `
      <strong>${name}</strong><br>
      ISO: ${iso2 || "—"}<br>
      <em>(Mineral stats placeholder)</em>
    `;
  }

  /** Set the map cursor style for hover interactions. */
  function setCursor(cursor = "") {
    map.getCanvas().style.cursor = cursor;
  }

  /** Add all map data sources. */
  function addSources() {
    map.addSource(IDS.sources.countries, {
      type: "vector",
      url: "mapbox://mapbox.country-boundaries-v1"
    });

    map.addSource(IDS.sources.minerals, {
      type: "geojson",
      data: "assets/deposit-cleaned.geojson"
    });
  }

  /** Add the country outline and highlight layers. */
  function addCountryLayers() {
    map.addLayer({
      id: IDS.layers.countryOutline,
      type: "line",
      source: IDS.sources.countries,
      "source-layer": "country_boundaries",
      paint: {
        "line-color": "rgba(255,255,255,0.18)",
        "line-width": 0.9
      },
      filter: COUNTRY_BASE_FILTER
    });

    map.addLayer({
      id: IDS.layers.countryHighlight,
      type: "line",
      source: IDS.sources.countries,
      "source-layer": "country_boundaries",
      paint: {
        "line-color": "#00ffff",
        "line-width": 3
      },
      filter: ["==", ["get", "iso_3166_1"], ""]
    });
  }

  /** Add the mineral point layer. */
  function addMineralLayer() {
    map.addLayer({
      id: IDS.layers.mineralPoints,
      type: "circle",
      source: IDS.sources.minerals,
      paint: {
        "circle-radius": 6,
        "circle-color": "#ffcc00",
        "circle-stroke-color": "#333",
        "circle-stroke-width": 1
      }
    });
  }

  /** Bind all DOM/UI event listeners. */
  function bindUIEvents() {
    on(infoBtn, "click", () => scrollToEl(infoPage));
    on(backBtn, "click", () => scrollToEl(app));

    on(filterToggle, "click", () => togglePanel(filterPanel));
    on(chartToggle, "click", () => togglePanel(chartPanel));

    on(toggleLabelsBtn, "click", () => setSymbolsHidden(!symbolsHidden));

    on(searchBtn, "click", handleCountrySearch);
    on(resetBtn, "click", resetAll);

    on(input, "keydown", (e) => {
      if (e.key === "Enter") handleCountrySearch();
    });
  }

  /** Bind all map-specific interaction listeners. */
  function bindMapEvents() {
    map.on("click", (e) => {
      console.log(map.queryRenderedFeatures(e.point));

      const features = map.queryRenderedFeatures(e.point, {
        layers: [IDS.layers.countryOutline]
      });
      const feature = features?.[0];
      if (!feature) return;

      const { name, iso2 } = getCountryFeatureInfo(feature);

      setSelectionUI({ name, iso2: iso2 || "—" });
      if (iso2) applyCountryHighlight(iso2);

      const countryFiltered = allMineralData.filter(f =>
        f.country?.toLowerCase() === name.toLowerCase()
      );

      new mapboxgl.Popup({ closeOnClick: true, closeButton: true })
        .setLngLat(e.lngLat)
        .setHTML(buildCountryPopupHTML(name, iso2))
        .addTo(map);
    });

    map.on("mouseenter", IDS.layers.countryOutline, () => setCursor("pointer"));
    map.on("mouseleave", IDS.layers.countryOutline, () => setCursor(""));
  }

  const resetMineralsToAll = setupCheckboxGroup("mineral", "mineral_all");
  const resetUseCasesToAll = setupCheckboxGroup("useCase", "useCase_all");

  map.on("load", () => {
    addSources();
    addCountryLayers();
    addMineralLayer();
    bindUIEvents();
    bindMapEvents();

    setSymbolsHidden(true);
    setToggleGlyphs();
    resetAll();
    fetch("assets/deposit-cleaned.geojson")
    .then(res => res.json())
    .then(geojson => {
      allMineralData = geojson.features.map(f => f.properties);
      renderCharts(allMineralData);
    });
  });

  function getActiveCheckboxValues(name, allId){
    const allBox = document.getElementById(allId);
    console.log(`Checking active checkboxes for ${name}, allId: ${allId}, allBox checked: ${allBox?.checked}`);
    if (allBox?.checked) return null;

    const boxes = [...document.querySelectorAll(`input[type="checkbox"][name="${name}"]`)]
      .filter((box) => box.id !== allId && box.checked);

    return boxes.map(box => box.value);
  }
  
  function countByField(data, field) {
    const counts = {};
    data.forEach(d => {
      const raw = d[field];
      if (!raw) return;

      const values = String(raw).split(',').map(s => s.trim());
      values.forEach(val => {
        if (val) counts[val] = (counts[val] || 0) + 1;
      });
    });
    return counts;
  }
  

  function plotPie(divId, counts, title) {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 10);
    Plotly.newPlot(divId, [{
      labels: top.map(d => d[0]),
      values: top.map(d => d[1]),
      type: "pie",
      textinfo: "percent",
      hoverinfo: "label+value+percent"
    }], {title: { text: title }, autosize: true, margin: { l: 50, r: 30, t: 50, b: 50 } },
    { responsive: true }
    );
  }

  function plotBar(divId, counts, title) {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 10);
    Plotly.newPlot(divId, [{
      x: top.map(d => d[0]),
      y: top.map(d => d[1]),
      type: "bar"
    }], {title: { text: title }, autosize: true, margin: { l: 40, r: 20, t: 50, b: 50 } });
  }

  function renderCharts(allFeatures) {
    const activeMinerals = getActiveCheckboxValues("mineral", "mineral_all");
    console.log("Active Minerals:", activeMinerals);
    const activeUseCases = getActiveCheckboxValues("useCase", "useCase_all");
    console.log("Active Use Cases:", activeUseCases);

    let filtered = allFeatures;
    let mapFilter = null;

    if (activeMinerals) {
      filtered = filtered.filter(f => {
        const commodities = f.commodity.split(",").map(s => s.trim().toLowerCase());
        return activeMinerals.some(m => commodities.includes(m));
      });

      // Substring check: does the commodity field contain any of the active minerals?
      const mineralChecks = activeMinerals.map(m => 
        ["in", m, ["downcase", ["get", "commodity"]]]
      );
      mapFilter = mineralChecks.length === 1 ? mineralChecks[0] : ["any", ...mineralChecks];
    }
    if (activeUseCases) {
      filtered = filtered.filter(f => activeUseCases.includes(f.use_case));
      // TODO: build a proper use-case map filter if needed
    }

    if (mapFilter) {
      map.setFilter(IDS.layers.mineralPoints, mapFilter);
    } else {
      map.setFilter(IDS.layers.mineralPoints, null);
    }

    const filterType = activeMinerals ? "commodity"
      : activeUseCases ? "useCase"
      : "default";

    createChart(filtered, filterType);
  }

  function createChart(data, filterType) {
    if (filterType === "country") {
      plotPie("chartOne", countByField(data, "commodity"), "Commodity Breakdown");
      plotPie("chartTwo", countByField(data, "dep_type"), "Deposit Type Breakdown");

    } else if (filterType === "useCase") {
      plotPie("chartOne", countByField(data, "commodity"), "Commodity Breakdown for Use Case");
      plotBar("chartTwo", countByField(data, "country"), "Top 10 Countries by Site Count");

    } else if (filterType === "commodity") {
      plotPie("chartOne", countByField(data, "country"), "Country Breakdown for Commodity");
      plotBar("chartTwo", countByField(data, "dep_type"), "Deposit Type Breakdown");

    } else {
      plotPie("chartOne", countByField(data, "commodity"), "Commodity Breakdown");
      plotBar("chartTwo", countByField(data, "country"), "Top 10 Countries by Site Count");
    }
  }
});
