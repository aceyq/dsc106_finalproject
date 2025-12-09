// ----------------- Global state -----------------
let tempDataRaw = [];
let precipDataRaw = [];

const tempFixedY = [4, 30];   // adjust if needed for your data
const precipFixedY = [1.6, 4];

let showScenarios = ["ssp126", "ssp245", "ssp370", "ssp585"]; // which lines to show
let focusScenario = "ssp585"; // which scenario to feature in impact card

// Date parser for "YYYY-MM-DD HH:MM:SS"
const parseTime = d3.timeParse("%Y-%m-%d %H:%M:%S");

// Chart config
const chartConfig = {
  width: 360,
  height: 260,
  margin: { top: 35, right: 18, bottom: 40, left: 55 }
};

// Tooltip shared by charts
const tooltip = d3.select("body")
  .append("div")
  .attr("class", "tooltip");

// ----------------- Helper: scenario label -----------------
function scenarioLabel(key) {
  const labels = {
    ssp126: "SSP1-2.6 (low emissions)",
    ssp245: "SSP2-4.5 (intermediate)",
    ssp370: "SSP3-7.0 (high, uneven action)",
    ssp585: "SSP5-8.5 (fossil-fuel intensive)"
  };
  return labels[key] || key;
}

// ----------------- Load data -----------------
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
  initializeRegionMap();
  initializeScenarioPills();
  initializeScrolly();

  const defaultRegion = "Global";
  d3.select("#region-select").property("value", defaultRegion);
  d3.select("#current-region-label").text(defaultRegion);
  highlightMapRegion(defaultRegion);

  updateCharts();
  updateImpactCard();
}).catch(err => {
  console.error("Error loading CSVs:", err);
});

// ----------------- Tabs -----------------
function initializeTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach(panel => {
        panel.classList.toggle("active", panel.id === `tab-${tab}`);
      });
    });
  });
}

// ----------------- Controls -----------------
function initializeControls() {
  const regions = Array.from(new Set(tempDataRaw.map(d => d.region))).sort();

  const regionSelect = d3.select("#region-select");
  regionSelect
    .selectAll("option")
    .data(regions)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  regionSelect.on("change", () => {
    const r = regionSelect.property("value");
    d3.select("#current-region-label").text(r);
    highlightMapRegion(r);
    updateCharts();
    updateImpactCard();
  });
}

// ----------------- Scenario pills -----------------
function initializeScenarioPills() {
  const pills = document.querySelectorAll(".pill");

  pills.forEach(pill => {
    pill.addEventListener("click", () => {
      pill.classList.toggle("active");

      const active = Array.from(pills)
        .filter(p => p.classList.contains("active"))
        .map(p => p.dataset.scn);

      // Avoid empty state: if user turns everything off, turn this one back on
      if (active.length === 0) {
        pill.classList.add("active");
        showScenarios = [pill.dataset.scn];
      } else {
        showScenarios = active;
      }

      // Use the first active scenario as focus for the impact card
      focusScenario = showScenarios[0];
      updateCharts();
      updateImpactCard();
    });
  });
}

// ----------------- 2D Map -----------------
const REGION_POSITIONS = [
  { name: "Global",        x: 400, y: 200 },
  { name: "North America", x: 240, y: 155 },
  { name: "South America", x: 290, y: 275 },
  { name: "Europe",        x: 415, y: 140 },
  { name: "Africa",        x: 435, y: 235 },
  { name: "East Asia",     x: 540, y: 185 },
  { name: "South Asia",    x: 510, y: 245 },
  { name: "Oceania",       x: 620, y: 305 }
];

function initializeRegionMap() {
  const svg = d3.select("#region-map-svg");
  if (svg.empty()) return;

  const group = svg.select("g.map-dots");

  group.selectAll("circle.map-dot")
    .data(REGION_POSITIONS)
    .join("circle")
    .attr("class", "map-dot")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", 8)
    .on("click", (event, d) => {
      setRegionFromMap(d.name);
    });

  group.selectAll("text.map-label")
    .data(REGION_POSITIONS)
    .join("text")
    .attr("class", "map-label")
    .attr("x", d => d.x + 11)
    .attr("y", d => d.y + 3)
    .text(d => d.name);
}

function setRegionFromMap(regionName) {
  const regionSelect = d3.select("#region-select");
  regionSelect.property("value", regionName);
  d3.select("#current-region-label").text(regionName);
  highlightMapRegion(regionName);
  updateCharts();
  updateImpactCard();
}

function highlightMapRegion(regionName) {
  d3.selectAll(".map-dot")
    .classed("active", d => d.name === regionName);
}

// ----------------- Scrollytelling (scrollama) -----------------
function initializeScrolly() {
  if (typeof scrollama === "undefined") {
    console.warn("Scrollama not found; scrollytelling disabled.");
    return;
  }

  const scroller = scrollama();

  scroller
    .setup({
      container: "#story-column",
      step: ".scenario-step",
      offset: 0.6
    })
    .onStepEnter(response => {
      const el = response.element;
      const scenario = el.dataset.scenario;

      d3.selectAll(".scenario-step").classed("is-active", false);
      d3.select(el).classed("is-active", true);

      // briefly focus on the scrolled-to scenario
      focusScenario = scenario;
      showScenarios = [scenario];

      // sync pills
      const pills = document.querySelectorAll(".pill");
      pills.forEach(p => {
        p.classList.toggle("active", p.dataset.scn === scenario);
      });

      updateCharts();
      updateImpactCard();
    });

  window.addEventListener("resize", scroller.resize);
}

// ----------------- Chart updating -----------------
function updateCharts() {
  const region = d3.select("#region-select").property("value");

  const tempFiltered = tempDataRaw
    .filter(d => showScenarios.includes(d.scenario) && d.region === region)
    .sort((a, b) => d3.ascending(a.time, b.time));

  const precipFiltered = precipDataRaw
    .filter(d => showScenarios.includes(d.scenario) && d.region === region)
    .sort((a, b) => d3.ascending(a.time, b.time));

  drawLineChart({
    container: "#temp-chart",
    legendContainer: "#temp-chart-legend",
    data: tempFiltered,
    yAccessor: d => d.tas_C,
    yLabel: "Temperature (°C)",
    fixedYDomain: tempFixedY
  });

  drawLineChart({
    container: "#precip-chart",
    legendContainer: "#precip-chart-legend",
    data: precipFiltered,
    yAccessor: d => d.pr_day,
    yLabel: "Precipitation (mm/day)",
    fixedYDomain: precipFixedY
  });
}

// Generic multi-scenario line chart
function drawLineChart({ container, legendContainer, data, yAccessor, yLabel, fixedYDomain }) {
  const containerSel = d3.select(container);
  containerSel.selectAll("*").remove();

  const legendSel = d3.select(legendContainer);
  legendSel.selectAll("*").remove();

  const { width, height, margin } = chartConfig;

  const svg = containerSel
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  if (!data || data.length === 0) {
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .text("No data for this selection.");
    return;
  }

  const xScale = d3.scaleTime()
    .domain(d3.extent(data, d => d.time))
    .range([margin.left, width - margin.right]);

  const yScale = d3.scaleLinear()
    .domain(fixedYDomain)
    .range([height - margin.bottom, margin.top]);

  const xAxis = d3.axisBottom(xScale)
    .ticks(5)
    .tickFormat(d3.timeFormat("%Y"));

  const yAxis = d3.axisLeft(yScale)
    .ticks(5);

  svg.append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(xAxis);

  svg.append("g")
    .attr("class", "axis y-axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(yAxis);

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 8)
    .attr("text-anchor", "middle")
    .attr("font-size", "0.8rem")
    .text("Year");

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", 16)
    .attr("text-anchor", "middle")
    .attr("font-size", "0.8rem")
    .text(yLabel);

  const nested = d3.group(data, d => d.scenario);
  const color = d3.scaleOrdinal(d3.schemeCategory10)
    .domain(Array.from(nested.keys()));

  // legend
  Array.from(nested.keys()).forEach(key => {
    const item = legendSel.append("div").attr("class", "legend-item");
    item.append("span")
      .attr("class", "legend-swatch")
      .style("background-color", color(key));
    item.append("span").text(scenarioLabel(key));
  });

  const line = d3.line()
    .x(d => xScale(d.time))
    .y(d => yScale(yAccessor(d)));

  nested.forEach((values, key) => {
    svg.append("path")
      .datum(values)
      .attr("fill", "none")
      .attr("stroke", color(key))
      .attr("stroke-width", 2)
      .attr("d", line);

    svg.selectAll(`.point-${key}`)
      .data(values)
      .join("circle")
      .attr("class", `point-${key}`)
      .attr("cx", d => xScale(d.time))
      .attr("cy", d => yScale(yAccessor(d)))
      .attr("r", 3)
      .attr("fill", color(key))
      .on("mouseenter", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${scenarioLabel(key)}</strong><br/>
             Year: ${d.year}<br/>
             Value: ${yAccessor(d).toFixed(2)}`
          )
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mousemove", event => {
        tooltip
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseleave", () => tooltip.style("opacity", 0));
  });
}

// ----------------- Impact snapshot -----------------
function updateImpactCard() {
  const region = d3.select("#region-select").property("value");
  const scenario = focusScenario;

  const tempSeries = tempDataRaw
    .filter(d => d.region === region && d.scenario === scenario)
    .sort((a, b) => d3.ascending(a.year, b.year));

  const precipSeries = precipDataRaw
    .filter(d => d.region === region && d.scenario === scenario)
    .sort((a, b) => d3.ascending(a.year, b.year));

  if (!tempSeries.length || !precipSeries.length) {
    d3.select("#temp-delta").text("–");
    d3.select("#precip-delta").text("–");
    d3.select("#impact-temp-text").text("No data available for this combination yet.");
    d3.select("#impact-precip-text").text("");
    d3.select("#impact-scenario-label").text("–");
    d3.select("#temp-bar-fill").style("width", "0%");
    d3.select("#precip-bar-fill").style("width", "0%");
    return;
  }

  const tStart = tempSeries[0].tas_C;
  const tEnd = tempSeries[tempSeries.length - 1].tas_C;
  const tempDelta = tEnd - tStart;

  const pStart = precipSeries[0].pr_day;
  const pEnd = precipSeries[precipSeries.length - 1].pr_day;
  const precipDeltaPct = pStart === 0 ? 0 : ((pEnd - pStart) / pStart) * 100;

  const tempDeltaRounded = tempDelta.toFixed(1);
  const precipDeltaRounded = precipDeltaPct.toFixed(0);

  d3.select("#temp-delta").text(tempDeltaRounded);
  d3.select("#precip-delta").text(
    (precipDeltaPct >= 0 ? "+" : "") + precipDeltaRounded
  );

  d3.select("#impact-scenario-label").text(scenarioLabel(scenario));

  d3.select("#impact-temp-text").text(
    `${scenarioLabel(scenario)} in ${region} warms by about ${tempDeltaRounded}°C between the start and end of this record.`
  );

  const wetterOrDrier =
    precipDeltaPct > 3
      ? "wetter"
      : precipDeltaPct < -3
      ? "drier"
      : "fairly similar on average";

  d3.select("#impact-precip-text").text(
    `Average daily precipitation changes by roughly ${precipDeltaRounded}% over the same period, making this region ${wetterOrDrier}.`
  );

  // Bar widths: clamp to 0–100 for visuals
  const tempWidth = Math.min(Math.abs(tempDelta) / 6 * 100, 100); // assume 6°C ~ full bar
  const precipWidth = Math.min(Math.abs(precipDeltaPct) / 40 * 100, 100); // ±40% ~ full bar

  d3.select("#temp-bar-fill").style("width", `${tempWidth}%`);
  d3.select("#precip-bar-fill").style("width", `${precipWidth}%`);
}
