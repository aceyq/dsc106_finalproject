// ============================================================
// GLOBAL STATE
// ============================================================
let tempDataRaw = [];
let precipDataRaw = [];

const tempFixedY = [4, 30];
const precipFixedY = [1.6, 4];

let showScenarios = ["ssp126", "ssp245", "ssp370", "ssp585"];
let activeScenarioForStory = "ssp245"; // for insight strip

let autoplayTimer = null;
let autoplayMinYear = 1850;
let autoplayMaxYear = 2100;

const chartConfig = {
  width: 720,
  height: 320,
  margin: { top: 40, right: 20, bottom: 50, left: 70 }
};

const mapConfig = {
  width: 440,
  height: 260
};

// region summaries populated after data load
let regionSummaries = {};

// Tabs
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

// Scenario pills
const pills = document.querySelectorAll(".pill");

// Tooltip for charts
const tooltip = d3.select("body")
  .append("div")
  .attr("class", "tooltip");

// Date parser for CSV timestamps
const parseTime = d3.timeParse("%Y-%m-%d %H:%M:%S");

// Scenario label helper
function scenarioLabel(key) {
  const labels = {
    ssp126: "SSP1-2.6 (Low Emissions)",
    ssp245: "SSP2-4.5 (Intermediate)",
    ssp370: "SSP3-7.0 (High)",
    ssp585: "SSP5-8.5 (Very High)"
  };
  return labels[key] || key;
}

// Scenario-level narrative snippets
const scenarioInsightTexts = {
  ssp126:
    "Rapid mitigation keeps warming comparatively shallow. The region still warms, but ecosystems and cities have more time to adapt.",
  ssp245:
    "A middle-of-the-road future. Warming is significant but not the worst case, leaving a narrowing window to prepare for regional impacts.",
  ssp370:
    "High emissions and uneven action. Temperatures climb faster and rainfall becomes more erratic, stressing water systems and vegetation.",
  ssp585:
    "A fossil-fuel intensive world. Warming is steep and rapid, pushing many regions toward thresholds where large biome shifts become likely."
};

// ============================================================
// MOOD + NARRATIVE HELPERS
// ============================================================
function setScenarioMood(scenario) {
  const body = document.body;
  body.classList.remove("scn-ssp126", "scn-ssp245", "scn-ssp370", "scn-ssp585");
  if (scenario) {
    body.classList.add("scn-" + scenario);
  }
}

function renderScenarioInsight() {
  const el = document.getElementById("scenario-insight");
  if (!el) return;

  const region = d3.select("#region-select").property("value") || "Global";
  const msg = scenarioInsightTexts[activeScenarioForStory];

  if (!msg) {
    el.textContent = "";
    return;
  }

  el.innerHTML = `<strong>${scenarioLabel(activeScenarioForStory)} in ${region}:</strong> ${msg}`;
}

// ============================================================
// DATA LOADING
// ============================================================
Promise.all([
  d3.csv("temp_df.csv", d => ({
    time: parseTime(d.time),
    year: +d.time.slice(0, 4),
    scenario: d.scenario,
    region: d.region,
    tas_C: +d.tas_C
  })),
  d3.csv("precip_df.csv", d => ({
    time: parseTime(d.time),
    year: +d.time.slice(0, 4),
    scenario: d.scenario,
    region: d.region,
    pr_day: +d.pr_day
  }))
]).then(([temp, precip]) => {
  tempDataRaw = temp;
  precipDataRaw = precip;

  initializeTabs();
  initializeControls();
  initializeAutoplay();
  initializePills();
  initializeScrolly();
  computeRegionSummaries();

  drawRegionMap();
  updateCharts();
  renderScenarioInsight();

}).catch(err => {
  console.error("Error loading CSVs:", err);
});

// ============================================================
// TABS
// ============================================================
function initializeTabs() {
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;

      tabButtons.forEach(b => b.classList.remove("active"));
      tabPanels.forEach(panel => panel.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(target).classList.add("active");
    });
  });
}

// ============================================================
// CONTROLS (regions + pills)
// ============================================================
function initializeControls() {
  const regions = Array.from(new Set(tempDataRaw.map(d => d.region))).sort();
  const regionSelect = d3.select("#region-select");

  regionSelect
    .selectAll("option")
    .data(regions)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  if (regions.includes("Global")) {
    regionSelect.property("value", "Global");
  }

  regionSelect.on("change", () => {
    const value = regionSelect.property("value");
    highlightRegionDot(value);
    renderScenarioInsight();
    updateCharts();
  });
}

// Scenario pills toggling
function initializePills() {
  pills.forEach(pill => {
    pill.addEventListener("click", () => {
      const scenario = pill.dataset.scn;

      pill.classList.toggle("active");

      showScenarios = Array.from(pills)
        .filter(p => p.classList.contains("active"))
        .map(p => p.dataset.scn);

      updateCharts();
    });
  });
}

// ============================================================
// AUTOPLAY CONTROLS (year slider + play/pause)
// ============================================================
function initializeAutoplay() {
  const slider = document.getElementById("year-slider");
  const label = document.getElementById("year-label");
  const playBtn = document.getElementById("play-pause-btn");
  if (!slider || !label || !playBtn) return;

  // derive year bounds from data
  const allYears = tempDataRaw.map(d => d.year);
  autoplayMinYear = d3.min(allYears);
  autoplayMaxYear = d3.max(allYears);

  slider.min = autoplayMinYear;
  slider.max = autoplayMaxYear;
  slider.value = autoplayMinYear;
  label.textContent = autoplayMinYear;

  // manual slider drag
  slider.addEventListener("input", () => {
    label.textContent = slider.value;
    stopAutoplay(); // stop if user takes over
    updateCharts();
  });

  // play / pause click
  playBtn.addEventListener("click", () => {
    if (autoplayTimer) {
      stopAutoplay();
    } else {
      startAutoplay();
    }
  });
}

function startAutoplay() {
  const slider = document.getElementById("year-slider");
  const label = document.getElementById("year-label");
  const playBtn = document.getElementById("play-pause-btn");

  if (!slider || !label || !playBtn) return;

  playBtn.textContent = "Pause";

  const stepSize = 5;
  const redrawBuffer = 700;
  const renderBuffer = 5000;

  function advance() {
    // if autoplay was stopped while waiting, abort
    if (!autoplayTimer) return;

    let current = +slider.value;
    let next = current + stepSize;

    if (next > autoplayMaxYear) {
      next = autoplayMinYear; // loop back to start
    }

    // update slider + label
    slider.value = next;
    label.textContent = next;

    // redraw charts for this year
    updateCharts();

    // wait for charts to finish + then 3s viewing time
    autoplayTimer = setTimeout(() => {
      advance();
    }, redrawBuffer + renderBuffer);
  }

  // small delay before the first step
  autoplayTimer = setTimeout(advance, 500);
}

function stopAutoplay() {
  const playBtn = document.getElementById("play-pause-btn");
  if (autoplayTimer) {
    clearInterval(autoplayTimer);
    autoplayTimer = null;
  }
  if (playBtn) {
    playBtn.textContent = "Play";
  }
}

function filterBySliderYear(data) {
  const slider = document.getElementById("year-slider");
  if (!slider) return data;
  const cutoff = +slider.value;
  return data.filter(d => d.year <= cutoff);
}

// ============================================================
// REGION SUMMARIES (for map card)
// ============================================================
function computeRegionSummaries() {
  const baseScenario = "ssp245";

  const groupedTemp = d3.group(
    tempDataRaw.filter(d => d.scenario === baseScenario),
    d => d.region
  );

  groupedTemp.forEach((records, region) => {
    const sorted = records.slice().sort((a, b) => a.year - b.year);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const deltaT = last.tas_C - first.tas_C;

    const precipRecords = precipDataRaw
      .filter(d => d.scenario === baseScenario && d.region === region)
      .sort((a, b) => a.year - b.year);

    let deltaP = null;
    if (precipRecords.length > 1) {
      const pFirst = precipRecords[0];
      const pLast = precipRecords[precipRecords.length - 1];
      deltaP = pLast.pr_day - pFirst.pr_day;
      regionSummaries[region] = {
        startYear: first.year,
        endYear: last.year,
        deltaT,
        deltaP
      };
    } else {
      regionSummaries[region] = {
        startYear: first.year,
        endYear: last.year,
        deltaT,
        deltaP: null
      };
    }
  });
}

function updateRegionSummary(region) {
  const card = document.getElementById("region-summary");
  if (!card) return;

  const summary = regionSummaries[region];

  if (!summary) {
    card.innerHTML = `
      <h3>${region} snapshot</h3>
      <p>
        This region is available in the CMIP6 data set, but we do not yet compute a summary
        statistic here. Use the charts below to explore how its temperature and precipitation
        trajectories differ from the global average.
      </p>
    `;
    return;
  }

  const { startYear, endYear, deltaT, deltaP } = summary;
  const warming = deltaT.toFixed(1);
  let precipText = "Precipitation changes are modest overall.";

  if (deltaP !== null) {
    const sign = deltaP > 0 ? "increase" : "decrease";
    const amount = Math.abs(deltaP).toFixed(2);
    precipText = `Average daily precipitation shows a ${sign} of about ${amount} mm/day over the same period.`;
  }

  card.innerHTML = `
    <h3>${region} snapshot under SSP2-4.5</h3>
    <p>
      From <strong>${startYear}</strong> to <strong>${endYear}</strong>, this region warms by roughly
      <strong>${warming}°C</strong> in the CMIP6 projections. ${precipText}
      This provides a baseline “middle-of-the-road” future you can compare against higher or lower emission pathways.
    </p>
  `;
}

// ============================================================
// MAIN UPDATE FUNCTION FOR BOTH CHARTS
// ============================================================
function updateCharts() {
  const region = d3.select("#region-select").property("value");

  let tempFiltered = tempDataRaw
    .filter(d => showScenarios.includes(d.scenario) && d.region === region)
    .sort((a, b) => d3.ascending(a.time, b.time));

  let precipFiltered = precipDataRaw
    .filter(d => showScenarios.includes(d.scenario) && d.region === region)
    .sort((a, b) => d3.ascending(a.time, b.time));

  // apply autoplay time filter
  tempFiltered = filterBySliderYear(tempFiltered);
  precipFiltered = filterBySliderYear(precipFiltered);

  drawLineChart({
    container: "#temp-chart",
    data: tempFiltered,
    yAccessor: d => d.tas_C,
    yLabel: "Temperature (°C)",
    title: `Temperature – ${region}`,
    fixedYDomain: tempFixedY,
    showAllScenarios: showScenarios.length > 1
  });

  drawLineChart({
    container: "#precip-chart",
    data: precipFiltered,
    yAccessor: d => d.pr_day,
    yLabel: "Precipitation (mm/day)",
    title: `Precipitation – ${region}`,
    fixedYDomain: precipFixedY,
    showAllScenarios: showScenarios.length > 1
  });

  renderScenarioInsight();
}

// ============================================================
// LINE CHARTS
// ============================================================
function drawLineChart({ container, data, yAccessor, yLabel, title, fixedYDomain, showAllScenarios }) {
  const containerSel = d3.select(container);
  containerSel.selectAll("*").remove();

  const legendDiv = d3.select(container + "-legend");
  legendDiv.selectAll("*").remove();

  const { width, height, margin } = chartConfig;

  const svg = containerSel.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  if (!data || data.length === 0) {
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .text("No data available.");
    return;
  }

  const xScale = d3.scaleTime()
    .domain(d3.extent(data, d => d.time))
    .range([margin.left, width - margin.right]);

  const yScale = d3.scaleLinear()
    .domain(fixedYDomain)
    .range([height - margin.bottom, margin.top]);

  // Axes
  svg.append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.timeFormat("%Y")));

  svg.append("g")
    .attr("class", "axis y-axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale).ticks(5));

  // Labels
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 10)
    .attr("text-anchor", "middle")
    .text("Year");

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", 18)
    .attr("text-anchor", "middle")
    .text(yLabel);

  // Title
  svg.append("text")
    .attr("x", margin.left)
    .attr("y", margin.top - 15)
    .attr("font-weight", "600")
    .attr("font-size", "0.95rem")
    .text(title);

  const line = d3.line()
    .x(d => xScale(d.time))
    .y(d => yScale(yAccessor(d)));

  if (showAllScenarios) {
    // Group by scenario
    const nested = d3.group(data, d => d.scenario);
    const color = d3.scaleOrdinal(d3.schemeCategory10)
      .domain(Array.from(nested.keys()));

    // Legend
    Array.from(nested.keys()).forEach(key => {
      const item = legendDiv.append("div").attr("class", "legend-item");
      item.append("div").style("background-color", color(key));
      item.append("span").text(scenarioLabel(key));
    });

    nested.forEach((values, key) => {
      // Animated path
      const path = svg.append("path")
        .datum(values)
        .attr("fill", "none")
        .attr("stroke", color(key))
        .attr("stroke-width", 2)
        .attr("d", line);

      const totalLength = path.node().getTotalLength();
      path
        .attr("stroke-dasharray", totalLength + " " + totalLength)
        .attr("stroke-dashoffset", totalLength)
        .transition()
        .duration(900)
        .ease(d3.easeCubic)
        .attr("stroke-dashoffset", 0);

      const pointsToShow = values.filter(d => d.year % 5 === 0);
      svg.selectAll(".point-" + key)
        .data(pointsToShow)
        .join("circle")
        .attr("class", "point-" + key)
        .attr("cx", d => xScale(d.time))
        .attr("cy", d => yScale(yAccessor(d)))
        .attr("r", 3)
        .attr("fill", color(key))
        .on("mouseenter", (event, d) => {
          tooltip.style("opacity", 1)
            .html(
              `<strong>${scenarioLabel(key)}</strong><br/>
               Year: ${d.year}<br/>
               Value: ${yAccessor(d).toFixed(2)}`
            )
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mousemove", (event) => {
          tooltip.style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseleave", () => tooltip.style("opacity", 0));
    });

  } else {
    // Single scenario view
    const path = svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2)
      .attr("d", line);

    const totalLength = path.node().getTotalLength();
    path
      .attr("stroke-dasharray", totalLength + " " + totalLength)
      .attr("stroke-dashoffset", totalLength)
      .transition()
      .duration(900)
      .ease(d3.easeCubic)
      .attr("stroke-dashoffset", 0);

    svg.selectAll(".point")
      .data(data)
      .join("circle")
      .attr("class", "point")
      .attr("cx", d => xScale(d.time))
      .attr("cy", d => yScale(yAccessor(d)))
      .attr("r", 3)
      .attr("fill", "#1d4ed8")
      .on("mouseenter", (event, d) => {
        tooltip.style("opacity", 1)
          .html(
            `Year: ${d.year}<br/>
             Value: ${yAccessor(d).toFixed(2)}`
          )
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseleave", () => tooltip.style("opacity", 0));
  }
}

// ============================================================
// WORLD MAP + REGION MARKERS
// ============================================================
function drawRegionMap() {
  const container = d3.select("#region-map");
  container.selectAll("*").remove();

  const { width, height } = mapConfig;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
    .then(world => {
      const countries = topojson.feature(world, world.objects.countries);

      const projection = d3.geoNaturalEarth1()
        .fitSize([width, height], countries);

      const path = d3.geoPath(projection);

      // Ocean / sphere
      svg.append("path")
        .datum({ type: "Sphere" })
        .attr("d", path)
        .attr("fill", "#020617")
        .attr("stroke", "#0b1220")
        .attr("stroke-width", 0.5);

      // Land
      svg.append("g")
        .selectAll("path")
        .data(countries.features)
        .join("path")
        .attr("d", path)
        .attr("fill", "#020617")
        .attr("stroke", "#1f2937")
        .attr("stroke-width", 0.4)
        .attr("opacity", 0.9);

      // Available regions in the data
      const regionsAvailable = new Set(tempDataRaw.map(d => d.region));

      const markersAll = [
        { name: "Global", lon: 0, lat: 0 },
        { name: "North America", lon: -100, lat: 40 },
        { name: "South America", lon: -60, lat: -15 },
        { name: "Europe", lon: 10, lat: 50 },
        { name: "Africa", lon: 20, lat: 5 },
        { name: "Asia", lon: 90, lat: 30 },
        { name: "Oceania", lon: 135, lat: -25 },
        { name: "Arctic", lon: 0, lat: 75 }
      ];

      const markers = markersAll.filter(m => regionsAvailable.has(m.name));

      const dots = svg.append("g")
        .attr("class", "region-dots")
        .selectAll("circle")
        .data(markers, d => d.name)
        .join("circle")
        .attr("class", "region-dot")
        .attr("cx", d => projection([d.lon, d.lat])[0])
        .attr("cy", d => projection([d.lon, d.lat])[1])
        .attr("r", 5)
        .on("click", (event, d) => {
          d3.select("#region-select").property("value", d.name);
          highlightRegionDot(d.name);
          renderScenarioInsight();
          updateCharts();
        });

      dots.append("title").text(d => d.name);

      // Initial highlight based on current dropdown
      const currentRegion = d3.select("#region-select").property("value");
      highlightRegionDot(currentRegion);
    });
}

function highlightRegionDot(regionName) {
  const dots = d3.selectAll(".region-dot");

  dots
    .classed("active-region", d => d.name === regionName)
    .transition()
    .duration(300)
    .attr("r", d => (d.name === regionName ? 8 : 5));

  updateRegionSummary(regionName);
}

// ============================================================
// SCROLLYTELLING (Scrollama + progress bar + click)
// ============================================================
function initializeScrolly() {
  if (typeof scrollama === "undefined") {
    console.warn("Scrollama missing.");
    return;
  }

  const steps = document.querySelectorAll("#scrolly-text .step");
  const progressInner = document.getElementById("scroll-progress-inner");

  // Scroll progress bar
  function updateScrollProgress() {
    const container = document.getElementById("scrolly-text");
    if (!container || !progressInner) return;

    const rect = container.getBoundingClientRect();
    const viewHeight = window.innerHeight || document.documentElement.clientHeight;

    const total = rect.height - viewHeight;
    if (total <= 0) {
      progressInner.style.width = "0%";
      return;
    }

    const scrolled = Math.min(Math.max(-rect.top, 0), total);
    const pct = (scrolled / total) * 100;
    progressInner.style.width = pct + "%";
  }

  window.addEventListener("scroll", updateScrollProgress);
  window.addEventListener("resize", updateScrollProgress);
  updateScrollProgress();

  // Scrollama controller
  const scroller = scrollama();
  scroller
    .setup({
      container: "#scrolly-1",
      step: "#scrolly-1 .step",
      offset: 0.55
    })
    .onStepEnter((response) => {
      const el = response.element;
      const scenario = el.dataset.scenario;

      d3.selectAll("#scrolly-1 .step").classed("is-active", false);
      d3.select(el).classed("is-active", true);

      activeScenarioForStory = scenario;
      setScenarioMood(scenario);

      // Focus on one scenario when step is active
      pills.forEach(p => {
        if (p.dataset.scn === scenario) p.classList.add("active");
        else p.classList.remove("active");
      });
      showScenarios = [scenario];
      updateCharts();
    });

  window.addEventListener("resize", scroller.resize);

  // Also allow clicking on a step
  steps.forEach(step => {
    step.addEventListener("click", () => {
      const scenario = step.dataset.scenario;

      d3.selectAll("#scrolly-1 .step").classed("is-active", false);
      d3.select(step).classed("is-active", true);

      activeScenarioForStory = scenario;
      setScenarioMood(scenario);

      pills.forEach(p => {
        if (p.dataset.scn === scenario) p.classList.add("active");
        else p.classList.remove("active");
      });
      showScenarios = [scenario];
      updateCharts();
    });
  });

  // Initial mood
  const firstScenario = steps[0]?.dataset.scenario;
  if (firstScenario) {
    activeScenarioForStory = firstScenario;
    setScenarioMood(firstScenario);
  }
}
