// Global variables to store data
let tempDataRaw = [];
let precipDataRaw = [];
let tempGlobalMin, tempGlobalMax;
let precipGlobalMin, precipGlobalMax;

// Date parser for "YYYY-MM-DD HH:MM:SS"
const parseTime = d3.timeParse("%Y-%m-%d %H:%M:%S");

// Dimensions for charts
const chartConfig = {
    width: 720,
    height: 320,
    margin: { top: 40, right: 20, bottom: 50, left: 70 }
  };

// Create a single tooltip div (shared by both charts)
const tooltip = d3.select("body")
  .append("div")
  .attr("class", "tooltip");

// Helper: scenario label
function scenarioLabel(key) {
  const labels = {
    ssp126: "SSP1-2.6 (Low Emissions)",
    ssp245: "SSP2-4.5 (Intermediate)",
    ssp370: "SSP3-7.0 (High)",
    ssp585: "SSP5-8.5 (Very High)"
  };
  return labels[key] || key;
}

// Load data
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
  updateCharts(); // draw initial charts
}).catch(err => {
  console.error("Error loading CSVs:", err);
});

// Initialize dropdowns based on data
function initializeControls() {
  const scenarios = Array.from(
    new Set(tempDataRaw.map(d => d.scenario))
  ).sort();

  const regions = Array.from(
    new Set(tempDataRaw.map(d => d.region))
  ).sort();

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

  // Default selection: SSP2-4.5 & Global, if available
  if (scenarios.includes("ssp245")) {
    scenarioSelect.property("value", "ssp245");
  }
  if (regions.includes("Global")) {
    regionSelect.property("value", "Global");
  }

  // Listeners
  scenarioSelect.on("change", updateCharts);
  regionSelect.on("change", updateCharts);
}

// Filter data and redraw both charts
function updateCharts() {
  const scenario = d3.select("#scenario-select").property("value");
  const region = d3.select("#region-select").property("value");

  const tempFiltered = tempDataRaw
    .filter(d => d.scenario === scenario && d.region === region)
    .sort((a, b) => d3.ascending(a.time, b.time));

  const precipFiltered = precipDataRaw
    .filter(d => d.scenario === scenario && d.region === region)
    .sort((a, b) => d3.ascending(a.time, b.time));

  drawLineChart({
    container: "#temp-chart",
    data: tempFiltered,
    yAccessor: d => d.tas_C,
    yLabel: "Temperature (°C)",
    title: `Temperature – ${scenarioLabel(scenario)}, ${region}`,
    fixedYDomain: [tempGlobalMin, tempGlobalMax]
  });

  drawLineChart({
    container: "#precip-chart",
    data: precipFiltered,
    yAccessor: d => d.pr_day,
    yLabel: "Precipitation (mm/day)",
    title: `Precipitation – ${scenarioLabel(scenario)}, ${region}`,
    fixedYDomain: [precipGlobalMin, precipGlobalMax]
  });
}

// Generic line chart drawing function using D3
function drawLineChart({ container, data, yAccessor, yLabel, title, fixedYDomain}) {
  // Clear any existing SVG
  const containerSel = d3.select(container);
  containerSel.selectAll("*").remove();

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
      .text("No data available for this selection.");
    return;
  }

  // Scales
  const xExtent = d3.extent(data, d => d.time);
  // const yExtent = d3.extent(data, yAccessor);

  const xScale = d3.scaleTime()
    .domain(xExtent)
    .range([margin.left, width - margin.right]);

  //const yPadding = (yExtent[1] - yExtent[0]) * 0.1 || 1;
  // const yScale = d3.scaleLinear()
    //.domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
    //.nice()
    //.range([height - margin.bottom, margin.top]);

  let yMin, yMax;

  if (fixedYDomain) {
    // Use global range
    yMin = fixedYDomain[0];
    yMax = fixedYDomain[1];
  } else {
    // fallback (should not happen for your project)
    const yExtent = d3.extent(data, yAccessor);
    yMin = yExtent[0];
    yMax = yExtent[1];
  }
const yScale = d3.scaleLinear()
  .domain([yMin, yMax])
  .range([height - margin.bottom, margin.top]);

  // Axes
  const xAxis = d3.axisBottom(xScale)
    .ticks(6)
    .tickFormat(d3.timeFormat("%Y"));

  const yAxis = d3.axisLeft(yScale)
    .ticks(5);

  svg.append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0, ${height - margin.bottom})`)
    .call(xAxis);

  svg.append("g")
    .attr("class", "axis y-axis")
    .attr("transform", `translate(${margin.left}, 0)`)
    .call(yAxis);

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

  // Line generator
  const line = d3.line()
    .x(d => xScale(d.time))
    .y(d => yScale(yAccessor(d)));

  // Line path
  svg.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "#3b82f6")
    .attr("stroke-width", 2)
    .attr("d", line);

  // Points
  svg.selectAll(".point")
    .data(data)
    .join("circle")
    .attr("class", "point")
    .attr("cx", d => xScale(d.time))
    .attr("cy", d => yScale(yAccessor(d)))
    .attr("r", 3)
    .attr("fill", "#1d4ed8")
    .on("mouseenter", (event, d) => {
      const year = d.year;
      const value = yAccessor(d).toFixed(2);
      tooltip
        .style("opacity", 1)
        .html(`
          <strong>Year:</strong> ${year}<br />
          <strong>Value:</strong> ${value} ${yLabel.includes("Temperature") ? "°C" : "mm/day"}
        `)
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
    });
}
