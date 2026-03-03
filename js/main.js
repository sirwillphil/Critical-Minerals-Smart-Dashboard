mapboxgl.accessToken =
  "pk.eyJ1IjoibGlhbnM3NyIsImEiOiJjbWt6NGxhMjcwZTJsM2Vwd2RtbWVvZHRuIn0.HDVAEM1yBC3D51XX3B4NPw";

const DEFAULT_VIEW = { center: [10, 20], zoom: 1.6 };

function normalize(str) {
  return String(str || "").trim();
}
function safeSetText(el, txt) {
  if (el) el.textContent = txt;
}

document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("top");

  const infoBtn = document.getElementById("infoJumpBtn");
  const backBtn = document.getElementById("backToMapBtn");
  const infoPage = document.getElementById("infoPage");
  const top = document.getElementById("top");

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
    container: "map",
    style: "mapbox://styles/mapbox/dark-v10",
    projection: "mercator",
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    minZoom: 1,
    maxZoom: 9
  });

  function setSelectionUI({ name = "—", iso2 = "—" } = {}) {
    safeSetText(statCountry, name);
    safeSetText(statISO, iso2);
  }

  function fitToBBox(bbox, duration = 1200) {
    if (!Array.isArray(bbox) || bbox.length !== 4) return;
    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
      padding: 60,
      duration
    });
  }

  function applyCountryHighlight(iso2) {
    if (!map.getLayer("country-highlight")) return;
    const code = (iso2 || "").toUpperCase();

    if (!code) {
      map.setFilter("country-highlight", ["==", ["get", "iso_3166_1"], ""]);
      return;
    }

    map.setFilter("country-highlight", [
      "all",
      ["==", ["get", "disputed"], "false"],
      [
        "any",
        ["==", "all", ["get", "worldview"]],
        ["in", "US", ["get", "worldview"]]
      ],
      ["==", ["get", "iso_3166_1"], code]
    ]);
  }

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

    const iso2 = (feature?.properties?.short_code || "").toUpperCase();
    const name = feature?.text || feature?.place_name || q;
    const bbox = feature?.bbox;
    const center = feature?.center;

    return { name, iso2, bbox, center };
  }

  function zoomToCountryResult(result) {
    if (!result) return;

    if (Array.isArray(result.bbox) && result.bbox.length === 4) {
      fitToBBox(result.bbox, 1400);
    } else if (Array.isArray(result.center) && result.center.length === 2) {
      map.flyTo({ center: result.center, zoom: 4, duration: 1400 });
    }

    setSelectionUI({ name: result.name, iso2: result.iso2 || "—" });
    if (result.iso2) applyCountryHighlight(result.iso2);
  }

  async function handleCountrySearch() {
    const query = normalize(input?.value);
    if (!query) {
      alert("Type a country name (example: Chile).");
      return;
    }

    const result = await geocodeCountry(query);
    if (!result) {
      alert("Country not found. Try another spelling.\nTip: enter a country name only.");
      return;
    }

    zoomToCountryResult(result);
  }

  function resetAll() {
    if (typeof resetMineralsToAll === "function") resetMineralsToAll();
    if (typeof resetUseCasesToAll === "function") resetUseCasesToAll();

    if (input) input.value = "";
    setSelectionUI({ name: "—", iso2: "—" });
    applyCountryHighlight("");

    map.flyTo({ center: DEFAULT_VIEW.center, zoom: DEFAULT_VIEW.zoom, duration: 1000 });
  }

  if (infoBtn && infoPage) {
    infoBtn.addEventListener("click", () => {
      infoPage.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  if (backBtn && top) {
    backBtn.addEventListener("click", () => {
      top.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function setToggleGlyphs() {
    if (filterToggle && filterPanel) {
      const collapsed = filterPanel.classList.contains("collapsed");
      filterToggle.textContent = collapsed ? "▶" : "◀";
      if (app) app.classList.toggle("left-collapsed", collapsed);
    }
    if (chartToggle && chartPanel) {
      const collapsed = chartPanel.classList.contains("collapsed");
      chartToggle.textContent = collapsed ? "◀" : "▶";
      if (app) app.classList.toggle("right-collapsed", collapsed);
    }
  }

  function resizeMapSoon() {
    window.setTimeout(() => map.resize(), 280);
  }

  if (filterToggle && filterPanel) {
    filterToggle.addEventListener("click", () => {
      filterPanel.classList.toggle("collapsed");
      setToggleGlyphs();
      resizeMapSoon();
    });
  }
  if (chartToggle && chartPanel) {
    chartToggle.addEventListener("click", () => {
      chartPanel.classList.toggle("collapsed");
      setToggleGlyphs();
      resizeMapSoon();
    });
  }

  let symbolsHidden = false;
  function setAllSymbolOpacity(opacity) {
    const style = map.getStyle();
    if (!style || !Array.isArray(style.layers)) return;
    style.layers.forEach((layer) => {
      if (layer.type !== "symbol") return;
      if (!map.getLayer(layer.id)) return;
      try { map.setPaintProperty(layer.id, "text-opacity", opacity); } catch (e) {}
      try { map.setPaintProperty(layer.id, "icon-opacity", opacity); } catch (e) {}
    });
  }
  function hideSymbols() {
    setAllSymbolOpacity(0);
    symbolsHidden = true;
    if (toggleLabelsBtn) toggleLabelsBtn.textContent = "Show Labels";
  }
  function showSymbols() {
    setAllSymbolOpacity(1);
    symbolsHidden = false;
    if (toggleLabelsBtn) toggleLabelsBtn.textContent = "Hide Labels";
  }
  if (toggleLabelsBtn) {
    toggleLabelsBtn.addEventListener("click", () => {
      symbolsHidden ? showSymbols() : hideSymbols();
    });
  }

  function setupCheckboxGroup(groupName, allId) {
    const allBox = document.getElementById(allId);
    const boxes = Array.from(document.querySelectorAll(`input[type="checkbox"][name="${groupName}"]`))
      .filter((b) => b !== allBox);

    if (!allBox) return;

    function setAllChecked() {
      allBox.checked = true;
      boxes.forEach((b) => (b.checked = false));
    }

    function ensureNotEmpty() {
      const anySpecificChecked = boxes.some((b) => b.checked);
      if (!anySpecificChecked) setAllChecked();
    }

    allBox.addEventListener("change", () => {
      if (allBox.checked) {
        boxes.forEach((b) => (b.checked = false));
      } else {
        ensureNotEmpty();
      }
    });

    boxes.forEach((box) => {
      box.addEventListener("change", () => {
        if (box.checked) {
          allBox.checked = false;
        }
        ensureNotEmpty();
      });
    });

    return setAllChecked;
  }

  const resetMineralsToAll = setupCheckboxGroup("mineral", "mineral_all");
  const resetUseCasesToAll = setupCheckboxGroup("useCase", "useCase_all");

  currentData = null;

  map.on("load", () => {
    map.addSource("countries", {
        type: "vector",
        url: "mapbox://mapbox.country-boundaries-v1"
    });

    map.addSource('minerals', {
        type: 'geojson',
        data: 'assets/ree.geojson'
    })

    map.addLayer({
        id: "country-outline",
        type: "line",
        source: "countries",
        "source-layer": "country_boundaries",
        paint: { "line-color": "rgba(255,255,255,0.18)", "line-width": 0.9 },
        filter: [
        "all",
        ["==", ["get", "disputed"], "false"],
        [
            "any",
            ["==", "all", ["get", "worldview"]],
            ["in", "US", ["get", "worldview"]]
        ]
        ]
    });

    map.addLayer({
        id: "country-highlight",
        type: "line",
        source: "countries",
        "source-layer": "country_boundaries",
        paint: { "line-color": "#00ffff", "line-width": 3 },
        filter: ["==", ["get", "iso_3166_1"], ""]
    });

    map.addLayer({
        id: 'mineral-points',
        type: 'circle',
        source: 'minerals',
        paint: {
            'circle-radius': 6,
        }
    })

    hideSymbols();

    if (searchBtn) searchBtn.addEventListener("click", handleCountrySearch);
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleCountrySearch();
      });
    }
    if (resetBtn) resetBtn.addEventListener("click", resetAll);

    map.on("click", (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["country-outline"] });
      const f = features?.[0];
      if (!f) return;

      const name = f?.properties?.name_en || f?.properties?.name || "Country";
      const iso2 = (f?.properties?.iso_3166_1 || "").toUpperCase();

      setSelectionUI({ name, iso2: iso2 || "—" });
      if (iso2) applyCountryHighlight(iso2);

      new mapboxgl.Popup({ closeOnClick: true, closeButton: true })
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${name}</strong><br>ISO: ${iso2 || "—"}<br><em>(Mineral stats placeholder)</em>`)
        .addTo(map);
    });


    map.on("mouseenter", "country-outline", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "country-outline", () => (map.getCanvas().style.cursor = ""));

    map.on('idle', () => {
        //const currentData = map.querySourceFeatures('minerals').map(f => f.properties);
        //createChart("chartOne", currentData, 'pie');
        //createChart("chartTwo", currentData, 'bar');
    });


    setToggleGlyphs();
    resetAll();
  });
});


function createChart(name,data, type) {

    if (type === "pie") {

        const counts = {};

        
        data.forEach(d => {
            const country = d.COUNTRY;
            if (!country) return;
            counts[country] = (counts[country] || 0) + 1;
        });

        // Convert to array and sort descending
        const sorted = Object.entries(counts)
            .sort((a, b) => b[1] - a[1]);

        // Take top 10
        const top10 = sorted.slice(0, 10);

        // Build Plotly trace
        const numbers = [{
            labels: top10.map(d => d[0]),   // country names
            values: top10.map(d => d[1]),   // counts
            type: "pie",
            textinfo: "label+percent",
            hoverinfo: "label+value+percent"
        }];

        Plotly.newPlot(name, numbers, {
            title: "Top 10 Countries by Site Count",
            autosize: true,
            margin: {
                l: 40,
                r: 20,
                t: 40,
                b: 40
            }, 
        });
    }
       
}