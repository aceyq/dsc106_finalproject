// ------------------- Globals & configuration -------------------

let tempDataRaw = [];
let precipDataRaw = [];

let currentRegion = "Global";
let focusedScenario = null;

const scenariosList = ["ssp126", "ssp245", "ssp370", "ssp585"];
let showScenarios = [...scenariosList];

// Rough region centroids for map dots (lon, lat)
const regionsConfig = [
  { id: "Global", name: "Global", lon: 0, lat: 0 },
  { id: "North America", name: "North America", lon: -100, lat: 40 },
  { id: "Europe", name: "Europe", lon: 10, lat: 50 },
  { id: "East Asia", name: "East Asia", lon: 120, lat: 35 },
  { id: "South Asia", name: "South Asia", lon: 80, lat: 20 },
  { id: "Africa", name: "Africa", lon: 20, lat: 5 },
  { id: "South America", name: "South America", lon: -60, lat: -15 },
  { id: "Oceania", name: "Oceania", lon: 140, lat: -25 }
];

const tempFixedY = [4, 30];    // °C
const precipFixedY = [1.6, 4]; // mm/day

// Date parser for "YYYY-MM-DD HH:MM:SS"
const parseTime = d3.timeParse("%Y-%m-%d %H:%M:%S");

// Dimensions for charts
const chartConfig = {
  width: 720,
  height: 320,
  margin: { top: 40, right: 20, bottom: 50, left: 70 }
};

// Shared tooltip
const tooltip = d3.select("body")
  .append("div")
  .attr("class", "tooltip");

// Map globals
let mapProjection;
let regionDots;

// ------------------- Labels & helpers -------------------

function scenarioLabel(key) {
  const labels = {
    ssp126: "SSP1-2.6 (Low emissions)",
    ssp245: "SSP2-4.5 (Intermediate)",
    ssp370: "SSP3-7.0 (High, uneven action)",
    ssp585: "SSP5-8.5 (Fossil-fuel intensive)"
  };
  return labels[key] || key;
}

function scenarioInsightText(scenario, region) {
  const baseRegion = region || "Global";
  switch (scenario) {
    case "ssp126":
      return `Rapid mitigation keeps warming comparatively shallow in ${baseRegion}, buying ecosystems and cities more time to adapt.`;
    case "ssp245":
      return `A middle-of-the-road future in ${baseRegion}: warming is significant but not the worst case, and impacts slowly stack over decades.`;
    case "ssp370":
      return `Fragmented action in ${baseRegion}: temperatures climb faster and rainfall becomes more volatile, raising the risk of climate shocks.`;
    case "ssp585":
      return `Fossil-fuel intensive path in ${baseRegion}: the largest and fastest warming, where adaptation has to race to catch up.`;
    default:
      return `Explore how different emissions pathways reshape temperature and rainfall in ${baseRegion}.`;
  }
}

function regionSummaryText(region, scenario) {
  const scnLabel = scenarioLabel(scenario);
  switch (region) {
    case "North America":
      return {
        title: `North America snapshot under ${scnLabel}`,
        body: `From the early 2000s to 2100, projections show steady warming across much of North America, with shifts in rainfall that matter for snowpack, wildfires, and crop yields.`
      };
    case "Europe":
      return {
        title: `Europe snapshot under ${scnLabel}`,
        body: `Europe warms faster than the global average in many scenarios, with heatwaves and changing rainfall patterns putting pressure on cities, forests, and rivers.`
      };
    case "East Asia":
      return {
        title: `East Asia snapshot under ${scnLabel}`,
        body: `East Asia faces both intense heat and changing monsoon behavior. Some regions see heavier downpours, others more frequent dry spells.`
      };
    case "South Asia":
      return {
        title: `South Asia snapshot under ${scnLabel}`,
        body: `South Asia’s climate future hinges on how monsoon patterns shift. Small changes in average rainfall can translate into large impacts on agriculture and flooding.`
      };
    case "Africa":
      return {
        title: `Africa snapshot under ${scnLabel}`,
        body: `Across Africa, warming combines with complex rainfall changes. Some areas become wetter, others drier, affecting water security and ecosystems.`
      };
    case "South America":
      return {
        title: `South America snapshot under ${scnLabel}`,
        body: `From the Amazon to the Andes, South America’s climate response varies widely, with consequences for rainforests, glaciers, and river systems.`
      };
    case "Oceania":
      return {
        title: `Oceania snapshot under ${scnLabel}`,
        body: `Oceania’s islands and coasts are highly exposed to warming oceans, sea-level rise, and shifting rainfall, even under mid-range scenarios.`
      };
    default:
      return {
        title: `Global snapshot under ${scnLabel}`,
        body: `Viewed as a whole, the planet warms in every scenario—but the pace and ultimate level of warming depend on how quickly emissions fall.`
      };
  }
}

// ------------------- Tabs -------------------

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      buttons.forEach(b => b.classList.remove("active"));
      panels.forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(target).classList.add("active");
    });
  });
}

// ------------------- Scenario pills -------------------

function setupScenarioPills() {
  const pills = document.querySelectorAll(".pill");

  const updateFromPills = () => {
    const active = Array.from(document.querySelectorAll(".pill.active"));
    if (active.length === 0) {
      // Force at least one active; default to SSP2-4.5
      const defaultPill = document.querySelector('.pill[data-scn="ssp245"]');
      if (defaultPill) defaultPill.classList.add("active");
    }
    showScenarios = Array.from(document.querySelectorAll(".pill.active"))
      .map(p => p.dataset.scn);
    updateScenarioInsight();
    updateCharts();
  };

  pills.forEach(pill => {
    pill.addEventListener("click", () => {
      const alreadyActive = pill.classList.contains("active");
      const activeCount = document.querySelectorAll(".pill.active").length;
      if (alreadyActive && activeCount === 1) {
        // keep at least one scenario on
        return;
      }
      pill.classList.toggle("active");
      // If we turned off the focused scenario, clear focus
      if (!pill.classList.contains("active") && focusedScenario === pill.dataset.scn) {
        focusedScenario = null;
      }
      updateFromPills();
    });
  });
}

// ------------------- Map -------------------

function initializeMap() {
  const container = d3.select("#region-map");
  container.selectAll("*").remove();

  const width = container.node().clientWidth || 480;
  const height = width * 0.6;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  mapProjection = d3.geoOrthographic()
    .scale(height * 0.46)
    .translate([width / 2, height / 2])
    .rotate([-20, -20])
    .clipAngle(90);

  const path = d3.geoPath(mapProjection);
  const graticule = d3.geoGraticule();

  // Sphere
  svg.append("path")
    .datum({ type: "Sphere" })
    .attr("d", path)
    .attr("fill", "#020617")
    .attr("stroke", "#0f172a");

  // Graticule
  svg.append("path")
    .datum(graticule())
    .attr("d", path)
    .attr("class", "graticule");

  // Region dots
  regionDots = svg.append("g")
    .selectAll("circle")
    .data(regionsConfig)
    .join("circle")
    .attr("class", d => "region-dot" + (d.id === currentRegion ? " active" : ""))
    .attr("r", d => d.id === "Global" ? 5 : 4)
    .attr("cx", d => mapProjection([d.lon, d.lat])[0])
    .attr("cy", d => mapProjection([d.lon, d.lat])[1])
    .on("mouseenter", (event, d) => {
      tooltip
        .style("opacity", 1)
        .html(`<strong>${d.name}</strong>`)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseleave", () => {
      tooltip.style("opacity", 0);
    })
    .on("click", (event, d) => {
      currentRegion = d.id;
      updateActiveRegionDot();
      updateRegionLabel();
      updateRegionSummary();
      updateScenarioInsight();
      updateCharts();
    });

  updateActiveRegionDot();
  updateRegionLabel();
  updateRegionSummary();
}

function updateActiveRegionDot() {
  if (!regionDots) return;
  regionDots.classed("active", d => d.id === currentRegion);
}

function updateRegionLabel() {
  const el = document.getElementById("current-region-label");
  if (el) el.textContent = currentRegion;
}

function updateRegionSummary() {
  const scenario = focusedScenario || showScenarios[0] || "ssp245";
  const summary = regionSummaryText(currentRegion, scenario);
  const container = d3.select("#region-summary");
  container.select("h3").text(summary.title);
  container.select("p").text(summary.body);
}

// ------------------- Scrollytelling -------------------

function setupScrolly() {
  if (typeof scrollama === "undefined") {
    console.warn("Scrollama not found; scrollytelling disabled.");
    return;
  }

  const scroller = scrollama();
  const stepsSel = d3.selectAll("#scrolly-1 .step");

  scroller
    .setup({
      container: "#scrolly-1",
      step: "#scrolly-1 .step",
      offset: 0.6
    })
    .onStepEnter((response) => {
      stepsSel.classed("is-active", false);
      d3.select(response.element).classed("is-active", true);

      const scenario = response.element.dataset.scenario;
      if (scenario) {
        focusedScenario = scenario;
        // ensure its pill is active
        const pill = document.querySelector(`.pill[data-scn="${scenario}"]`);
        if (pill) pill.classList.add("active");
        showScenarios = Array.from(document.querySelectorAll(".pill.active"))
          .map(p => p.dataset.scn);
      }

      updateScrollProgress(response.index, stepsSel.size());
      updateScenarioInsight();
      updateRegionSummary();
      updateCharts();
    });

  window.addEventListener("resize", scroller.resize);
}

function updateScrollProgress(index, total) {
  const frac = (index + 1) / total;
  d3.select("#scroll-progress-inner")
    .style("width", `${Math.max(0.2, frac) * 100}%`);
}

// ------------------- Charts -------------------

function updateCharts() {
  if (!tempDataRaw.length || !precipDataRaw.length) return;

  const region = currentRegion;

  const tempFiltered = tempDataRaw
    .filter(d => showScenarios.includes(d.scenario) && d.region === region)
    .sort((a, b) => d3.ascending(a.time, b.time));

  const precipFiltered = precipDataRaw
    .filter(d => showScenarios.includes(d.scenario) && d.region === region)
    .sort((a, b) => d3.ascending(a.time, b.time));

  drawLineChart({
    container: "#temp-chart",
    data: tempFiltered,
    yAccessor: d => d.tas_C,
    yLabel: "Temperature (°C)",
    title: `Temperature – ${region}`,
    fixedYDomain: tempFixedY
  });

  drawLineChart({
    container: "#precip-chart",
    data: precipFiltered,
    yAccessor: d => d.pr_day,
    yLabel: "Precipitation (mm/day)",
    title: `Precipitation – ${region}`,
    fixedYDomain: precipFixedY
  });

  const activeScenario = focusedScenario || (showScenarios[0] || "ssp245");
  updateImpactPanel({ region, scenario: activeScenario });
}

function drawLineChart({ container, data, yAccessor, yLabel, title, fixedYDomain }) {
  const containerSel = d3.select(container);
  containerSel.selectAll("*").remove();

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
      .text("No data available for this selection.");
    return;
  }

  const xExtent = d3.extent(data, d => d.time);
  const xScale = d3.scaleTime()
    .domain(xExtent)
    .range([margin.left, width - margin.right]);

  const yScale = d3.scaleLinear()
    .domain(fixedYDomain)
    .range([height - margin.bottom, margin.top]);

  // Shaded recent window: from 2000 to end of record
  const recentStart = new Date(2000, 0, 1);
  const clampedStart = recentStart < xExtent[0] ? xExtent[0] : recentStart;

  svg.append("rect")
    .attr("class", "recent-window")
    .attr("x", xScale(clampedStart))
    .attr("y", margin.top)
    .attr("width", xScale(xExtent[1]) - xScale(clampedStart))
    .attr("height", height - margin.top - margin.bottom);

  // Gridlines
  const yAxisGrid = d3.axisLeft(yScale)
    .ticks(5)
    .tickSize(-(width - margin.left - margin.right))
    .tickFormat("");

  svg.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(${margin.left},0)`)
    .call(yAxisGrid);

  // Axes
  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .attr("class", "axis x-axis")
    .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.timeFormat("%Y")));

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .attr("class", "axis y-axis")
    .call(d3.axisLeft(yScale).ticks(5));

  // Axis labels
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 10)
    .attr("text-anchor", "middle")
    .attr("font-size", "0.8rem")
    .text("Year");

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", 18)
    .attr("text-anchor", "middle")
    .attr("font-size", "0.8rem")
    .text(yLabel);

  // Title
  svg.append("text")
    .attr("x", margin.left)
    .attr("y", margin.top - 15)
    .attr("font-size", "0.95rem")
    .attr("font-weight", "600")
    .text(title);

  const line = d3.line()
    .x(d => xScale(d.time))
    .y(d => yScale(yAccessor(d)));

  const nested = d3.group(data, d => d.scenario);
  const legendDiv = d3.select(container + "-legend");
  legendDiv.selectAll("*").remove();

  const color = d3.scaleOrdinal(d3.schemeTableau10)
    .domain(scenariosList);

  // Legend items only for active scenarios
  Array.from(nested.keys()).forEach(key => {
    const item = legendDiv.append("div").attr("class", "legend-item");
    item.append("div").style("background-color", color(key));
    item.append("span").text(scenarioLabel(key));
  });

  // Lines & points
  nested.forEach((values, key) => {
    const sorted = values.slice().sort((a, b) => d3.ascending(a.time, b.time));

    svg.append("path")
      .datum(sorted)
      .attr("fill", "none")
      .attr("stroke", color(key))
      .attr("stroke-width", 2)
      .attr("d", line);

    // regular points
    svg.selectAll(".point-" + key)
      .data(sorted)
      .join("circle")
      .attr("class", "point-" + key)
      .attr("cx", d => xScale(d.time))
      .attr("cy", d => yScale(yAccessor(d)))
      .attr("r", 2.5)
      .attr("fill", color(key))
      .on("mouseenter", (event, d) => {
        const year = d.year;
        const value = yAccessor(d).toFixed(2);
        tooltip
          .style("opacity", 1)
          .html(`<strong>${scenarioLabel(key)}</strong><br/>
                 Year: ${year}<br/>
                 Value: ${value}`)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseleave", () => tooltip.style("opacity", 0));

    // endpoint marker (last point)
    const last = sorted[sorted.length - 1];
    svg.append("circle")
      .attr("cx", xScale(last.time))
      .attr("cy", yScale(yAccessor(last)))
      .attr("r", 4)
      .attr("fill", color(key))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.3);
  });
}

// ------------------- Impact Snapshot -------------------

function updateImpactPanel({ region, scenario }) {
  const tempSeries = tempDataRaw
    .filter(d => d.region === region && d.scenario === scenario)
    .sort((a, b) => d3.ascending(a.year, b.year));

  const precipSeries = precipDataRaw
    .filter(d => d.region === region && d.scenario === scenario)
    .sort((a, b) => d3.ascending(a.year, b.year));

  if (!tempSeries.length || !precipSeries.length) {
    d3.select("#impact-temp-delta").text("–");
    d3.select("#impact-precip-delta").text("–");
    d3.select("#impact-temp-bar").style("transform", "scaleX(0)");
    d3.select("#impact-precip-bar").style("transform", "scaleX(0)");
    return;
  }

  const tStart = tempSeries[0].tas_C;
  const tEnd = tempSeries[tempSeries.length - 1].tas_C;
  const tDelta = tEnd - tStart;

  const pStart = precipSeries[0].pr_day;
  const pEnd = precipSeries[precipSeries.length - 1].pr_day;
  const pDeltaAbs = pEnd - pStart;
  const pDeltaPct = (pDeltaAbs / pStart) * 100;

  const tClamped = Math.max(0, Math.min(tDelta, 6));
  const pClamped = Math.max(-40, Math.min(pDeltaPct, 40));

  d3.select("#impact-temp-delta").text(tDelta.toFixed(1));
  d3.select("#impact-precip-delta").text(
    (pDeltaPct >= 0 ? "+" : "") + pDeltaPct.toFixed(0) + "%"
  );

  d3.select("#impact-temp-caption").text(
    `${scenarioLabel(scenario)} in ${region} warms by about ${tDelta.toFixed(
      1
    )}°C between the start and end of this record.`
  );

  d3.select("#impact-precip-caption").text(
    `Average daily precipitation changes by roughly ${pDeltaPct >= 0 ? "an increase" : "a decrease"
    } of ${Math.abs(pDeltaPct).toFixed(0)}% over the same period.`
  );

  const tScale = tClamped / 6;
  const pScale = (pClamped + 40) / 80;

  d3.select("#impact-temp-bar")
    .style("transform", `scaleX(${tScale})`);

  d3.select("#impact-precip-bar")
    .style("transform", `scaleX(${pScale})`);
}

// ------------------- Scenario insight -------------------

function updateScenarioInsight() {
  const activeScenario = focusedScenario || (showScenarios[0] || "ssp245");
  const text = scenarioInsightText(activeScenario, currentRegion);
  d3.select("#scenario-insight").html(
    `<strong>${scenarioLabel(activeScenario)} in ${currentRegion}:</strong> ${text}`
  );

  // optional: set body class for subtle theming
  document.body.className = `scn-${activeScenario}`;
}

// ------------------- Data load & init -------------------

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

  setupTabs();
  setupScenarioPills();
  initializeMap();
  setupScrolly();
  updateScenarioInsight();
  updateCharts();
}).catch(err => {
  console.error("Error loading CSVs:", err);
});
