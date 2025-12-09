// ------------------------------------------------------------
// Global variables
// ------------------------------------------------------------
let tempDataRaw = [];
let precipDataRaw = [];
let tempGlobalMin, tempGlobalMax;
let precipGlobalMin, precipGlobalMax;

const tempFixedY = [4, 30];
const precipFixedY = [1.6, 4];

let showScenarios = ["ssp126", "ssp245", "ssp370", "ssp585"];

// Scenario pills
const pills = document.querySelectorAll(".pill");
pills.forEach(pill => {
  pill.addEventListener("click", () => {
    const scenario = pill.dataset.scn;

    // Toggle pill
    pill.classList.toggle("active");

    // Update selected scenarios
    showScenarios = Array.from(pills)
      .filter(p => p.classList.contains("active"))
      .map(p => p.dataset.scn);

    updateCharts();
  });
});

// Date parser
const parseTime = d3.timeParse("%Y-%m-%d %H:%M:%S");

// Chart dimensions
const chartConfig = {
  width: 720,
  height: 320,
  margin: { top: 40, right: 20, bottom: 50, left: 70 }
};

// Tooltip
const tooltip = d3.select("body")
  .append("div")
  .attr("class", "tooltip");

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

// ------------------------------------------------------------
// Load temperature + precipitation data
// ------------------------------------------------------------
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

  tempGlobalMin = d3.min(tempDataRaw, d => d.tas_C);
  tempGlobalMax = d3.max(tempDataRaw, d => d.tas_C);
  precipGlobalMin = d3.min(precipDataRaw, d => d.pr_day);
  precipGlobalMax = d3.max(precipDataRaw, d => d.pr_day);

  initializeControls();
  updateCharts();
  setupScrolly();
}).catch(err => {
  console.error("Error loading CSVs:", err);
});

// ------------------------------------------------------------
// Dropdown (region) initialization
// ------------------------------------------------------------
function initializeControls() {
  const scenarios = Array.from(new Set(tempDataRaw.map(d => d.scenario))).sort();
  const regions = Array.from(new Set(tempDataRaw.map(d => d.region))).sort();

  const scenarioSelect = d3.select("#scenario-select");
  const regionSelect = d3.select("#region-select");

  scenarioSelect
    .selectAll("option")
    .data(scenarios)
    .join("option")
    .attr("value", d => d)
    .text(d => scenarioLabel(d));

  regionSelect
    .selectAll("option")
    .data(regions)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  if (scenarios.includes("ssp245")) scenarioSelect.property("value", "ssp245");
  if (regions.includes("Global")) regionSelect.property("value", "Global");

  scenarioSelect.on("change", updateCharts);
  regionSelect.on("change", updateCharts);
}

// ------------------------------------------------------------
// Main update function for both charts
// ------------------------------------------------------------
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
}

// ------------------------------------------------------------
// Draw line chart (supports 1 or many scenarios)
// ------------------------------------------------------------
function drawLineChart({ container, data, yAccessor, yLabel, title, fixedYDomain, showAllScenarios }) {

  const containerSel = d3.select(container);
  containerSel.selectAll("*").remove();

  const legendDiv = d3.select(container + "-legend");
  if (!legendDiv.empty()) legendDiv.selectAll("*").remove();   // Always clear legend

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
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.timeFormat("%Y")));

  svg.append("g")
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

    const nested = d3.group(data, d => d.scenario);
    const color = d3.scaleOrdinal(d3.schemeCategory10)
      .domain(Array.from(nested.keys()));

    // Make legend
    Array.from(nested.keys()).forEach(key => {
      const item = legendDiv.append("div").attr("class", "legend-item");
      item.append("div").style("background-color", color(key));
      item.append("span").text(scenarioLabel(key));
    });

    // Multi-lines
    nested.forEach((values, key) => {
      svg.append("path")
        .datum(values)
        .attr("fill", "none")
        .attr("stroke", color(key))
        .attr("stroke-width", 2)
        .attr("d", line);

      svg.selectAll(".point-" + key)
        .data(values)
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

    // Single scenario mode
    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2)
      .attr("d", line);

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

// ------------------------------------------------------------
// SCROLLYTELLING: sync story steps → active scenario
// ------------------------------------------------------------
function setupScrolly() {
  if (typeof scrollama === "undefined") {
    console.warn("Scrollama missing.");
    return;
  }

  const scroller = scrollama();

  scroller
    .setup({
      container: "#scrolly-1",
      step: "#scrolly-1 .step",
      offset: 0.55
    })
    .onStepEnter((response) => {

      d3.selectAll("#scrolly-1 .step").classed("is-active", false);
      d3.select(response.element).classed("is-active", true);

      const scenario = response.element.dataset.scenario;
      if (!scenario) return;

      // Sync pills
      pills.forEach(p => {
        if (p.dataset.scn === scenario) p.classList.add("active");
        else p.classList.remove("active");
      });

      showScenarios = [scenario];  // focus on narrative scenario
      updateCharts();
    });

  window.addEventListener("resize", scroller.resize);

  // Also allow clicking on story steps to jump scenarios
  const stepEls = document.querySelectorAll("#scrolly-text .step");
  stepEls.forEach(step => {
    step.addEventListener("click", () => {
      const scenario = step.dataset.scenario;
      if (!scenario) return;

      d3.selectAll("#scrolly-1 .step").classed("is-active", false);
      d3.select(step).classed("is-active", true);

      pills.forEach(p => {
        if (p.dataset.scn === scenario) p.classList.add("active");
        else p.classList.remove("active");
      });

      showScenarios = [scenario];
      updateCharts();
    });
  });
}
