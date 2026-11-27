/**
 * Sustainable humanitarian project resource requirements dataset and pure
 * filtering/aggregation helpers for the Humanitarian Resource Dashboard.
 *
 * Strictly aggregate regional planning data — zero beneficiary PII or PHI.
 */

export const HUMANITARIAN_SECTORS = Object.freeze([
  { id: 'all', label: 'All Sectors' },
  { id: 'wash', label: 'WASH' },
  { id: 'energy', label: 'Clean Energy' },
  { id: 'shelter', label: 'Shelter' },
  { id: 'health', label: 'Health' },
  { id: 'agro', label: 'Agro-Ecology' },
]);

export const PRIORITY_ORDER = Object.freeze({
  critical: 0,
  high: 1,
  standard: 2,
});

export const HUMANITARIAN_PROJECTS = Object.freeze([
  {
    id: 'prj-wsh-01',
    code: 'PRJ-WSH-01',
    sector: 'wash',
    sectorLabel: 'WASH · Clean Water',
    region: 'East Africa',
    priority: 'critical',
    priorityLabel: 'Critical',
    title: 'Solar Micro-Grid Water Desalination',
    summary:
      'Brackish borehole treatment hub delivering 45,000 L/day of potable water via off-grid photovoltaic pumping with brine-recovery evaporation pans.',
    budgetUsdK: 148,
    timelineDays: 14,
    readinessPct: 84,
    carbonOffsetTons: 42,
    localSourcingPct: 68,
    renewableSource: '18 kW Bifacial PV + Gravity Buffer',
    sustainabilityNote:
      'Eliminates 14,200 L/yr of diesel generator fuel; modular membranes clean in place with biodegradable citric flush.',
    studyId: 'well',
    studyLabel: 'Preview Water Rig',
    resources: [
      { qty: '3×', item: 'Modular PV Arrays (18 kW)', category: 'Energy', spec: 'IP67 field rack' },
      { qty: '2×', item: 'Reverse-Osmosis Skid Units', category: 'Equipment', spec: 'Low-pressure 1.8 kWh/m³' },
      { qty: '12×', item: 'Gravity Storage Bladders', category: 'Storage', spec: '60,000 L food-grade TPU' },
      { qty: '4×', item: 'Field Water Engineers', category: 'Personnel', spec: '14-day commissioning' },
    ],
  },
  {
    id: 'prj-hlt-02',
    code: 'PRJ-HLT-02',
    sector: 'health',
    sectorLabel: 'Health · Cold-Chain',
    region: 'MENA',
    priority: 'critical',
    priorityLabel: 'Critical',
    title: 'Passive-Cooled Medical Cold-Chain Depot',
    summary:
      'Solar-direct vaccine and essential medicines storage node with 96-hour phase-change thermal holdover and strictly redacted aggregate inventory tracking.',
    budgetUsdK: 185,
    timelineDays: 10,
    readinessPct: 72,
    carbonOffsetTons: 31,
    localSourcingPct: 54,
    renewableSource: 'Solar-Direct Drive + PCM Thermal Bank',
    sustainabilityNote:
      'Zero CFC refrigerants (R600a hydrocarbon loop) and zero lead-acid battery waste; tracks aggregate lot counts only (zero PHI).',
    studyId: 'heart',
    studyLabel: 'Preview Cardiac Study',
    resources: [
      { qty: '6×', item: 'Phase-Change Thermal Vaults', category: 'Cold-Chain', spec: '2–8 °C · 96h autonomy' },
      { qty: '2×', item: 'Solar-Direct Refrigerators', category: 'Equipment', spec: 'WHO PQS compliant' },
      { qty: '1×', item: 'Aggregate Stock Telemetry Kit', category: 'Systems', spec: 'Zero-PHI barcode node' },
      { qty: '3×', item: 'Biomedical Cold-Chain Techs', category: 'Personnel', spec: 'Local clinic handover' },
    ],
  },
  {
    id: 'prj-shl-03',
    code: 'PRJ-SHL-03',
    sector: 'shelter',
    sectorLabel: 'Sustainable Shelter',
    region: 'South Asia',
    priority: 'high',
    priorityLabel: 'High',
    title: 'Modular Bamboo & Earth-Block Shelter Cluster',
    summary:
      'Cyclone-resilient transitional housing cluster constructed with locally harvested borax-treated bamboo trusses, compressed earth blocks, and rainwater roofs.',
    budgetUsdK: 210,
    timelineDays: 21,
    readinessPct: 91,
    carbonOffsetTons: 68,
    localSourcingPct: 86,
    renewableSource: 'Passive Cross-Ventilation + Rainwater Roofs',
    sustainabilityNote:
      'Replaces imported Portland cement and corrugated plastic sheeting; 86% regional material value retained in local craft economy.',
    studyId: 'hall',
    studyLabel: 'Preview Timber Hall',
    resources: [
      { qty: '48×', item: 'Treated Bamboo Truss Kits', category: 'Materials', spec: '140 km/h wind rated' },
      { qty: '2×', item: 'Manual Earth-Block Presses', category: 'Equipment', spec: '600 blocks/day zero-fuel' },
      { qty: '120×', item: 'Rainwater Catchment Gutters', category: 'WASH', spec: 'First-flush diverters' },
      { qty: '8×', item: 'Local Structural Masons', category: 'Personnel', spec: 'Peer-training crew' },
    ],
  },
  {
    id: 'prj-agr-04',
    code: 'PRJ-AGR-04',
    sector: 'agro',
    sectorLabel: 'Food & Agro-Ecology',
    region: 'Sahel',
    priority: 'high',
    priorityLabel: 'High',
    title: 'Agri-Voltaic Drip Irrigation Corridor',
    summary:
      'Dual-use shaded solar array rows paired with low-pressure gravity drip lines to reduce crop evapotranspiration by 38% across arid smallholder plots.',
    budgetUsdK: 164,
    timelineDays: 28,
    readinessPct: 79,
    carbonOffsetTons: 54,
    localSourcingPct: 74,
    renewableSource: 'Elevated Agri-Voltaic Canopy (24 kW)',
    sustainabilityNote:
      'Recycled HDPE drip lines with solar-timed moisture gating prevent aquifer over-extraction while doubling shade-tolerant legume yields.',
    studyId: 'tree',
    studyLabel: 'Preview Canopy Study',
    resources: [
      { qty: '14 km', item: 'Low-Pressure Drip Laterals', category: 'Irrigation', spec: 'UV-stabilized recycled HDPE' },
      { qty: '4×', item: 'Solar Submersible Pumps', category: 'Equipment', spec: 'Brushless DC · 65 m head' },
      { qty: '600 kg', item: 'Drought-Tolerant Seed Stock', category: 'Inputs', spec: 'Open-pollinated millet/cowpea' },
      { qty: '5×', item: 'Hydro-Agronomy Specialists', category: 'Personnel', spec: 'Cooperative training' },
    ],
  },
  {
    id: 'prj-eng-05',
    code: 'PRJ-ENG-05',
    sector: 'energy',
    sectorLabel: 'Clean Energy',
    region: 'Andes',
    priority: 'standard',
    priorityLabel: 'Standard',
    title: 'Community Micro-Hydro Grain Mill & Silo',
    summary:
      'Run-of-river 12 kW crossflow turbine powering cooperative grain milling and hermetic post-harvest storage with zero reservoir damming.',
    budgetUsdK: 132,
    timelineDays: 30,
    readinessPct: 88,
    carbonOffsetTons: 49,
    localSourcingPct: 81,
    renewableSource: '12 kW Run-of-River Micro-Hydro',
    sustainabilityNote:
      'Fish-screened intake returns 100% of stream flow within 180 m; hermetic silos cut post-harvest spoilage from 22% to under 3%.',
    studyId: 'night-mill',
    studyLabel: 'Preview Watermill',
    resources: [
      { qty: '2×', item: 'Crossflow Micro-Hydro Turbines', category: 'Energy', spec: '6 kW each · field-serviceable' },
      { qty: '1×', item: 'Hermetic Grain Silo Bank', category: 'Storage', spec: '40 MT galvanized steel' },
      { qty: '180 m', item: 'HDPE Penstock Conduit', category: 'Civil', spec: 'PN10 fusion-welded' },
      { qty: '4×', item: 'Civil & Turbine Technicians', category: 'Personnel', spec: 'Co-op maintenance cert' },
    ],
  },
  {
    id: 'prj-wsh-06',
    code: 'PRJ-WSH-06',
    sector: 'wash',
    sectorLabel: 'WASH · Sanitation',
    region: 'Southeast Asia',
    priority: 'high',
    priorityLabel: 'High',
    title: 'Greywater Bio-Filtration & Wetland Loop',
    summary:
      'Gravity-fed anaerobic baffled reactors and planted reed-bed filtration cells recycling camp washwater for safe non-potable agriculture.',
    budgetUsdK: 96,
    timelineDays: 18,
    readinessPct: 86,
    carbonOffsetTons: 27,
    localSourcingPct: 89,
    renewableSource: 'Zero-Power Gravity + Constructed Wetland',
    sustainabilityNote:
      'Zero grid electricity required; native Phragmites reed beds strip >85% BOD/TSS while preventing flood-season runoff contamination.',
    studyId: 'night-bridge',
    studyLabel: 'Preview Stream Study',
    resources: [
      { qty: '8×', item: 'Baffled Anaerobic Digesters', category: 'Sanitation', spec: 'Modular HDPE chambers' },
      { qty: '420 m²', item: 'Reed-Bed Graded Gravel Media', category: 'Materials', spec: 'Locally quarried aggregate' },
      { qty: '6×', item: 'Gravity Sand Filter Cells', category: 'Equipment', spec: 'Tool-free backwash' },
      { qty: '3×', item: 'Environmental Sanitation Leads', category: 'Personnel', spec: 'Water-quality sampling' },
    ],
  },
  {
    id: 'prj-eng-07',
    code: 'PRJ-ENG-07',
    sector: 'energy',
    sectorLabel: 'Clean Energy',
    region: 'East Africa',
    priority: 'standard',
    priorityLabel: 'Standard',
    title: 'Off-Grid Solar Lantern & Field Charging Hub',
    summary:
      'Rapid-deployment community kiosk replacing kerosene lamps with swappable LiFePO4 field lanterns and regulated DC charging for relief comms.',
    budgetUsdK: 68,
    timelineDays: 7,
    readinessPct: 94,
    carbonOffsetTons: 22,
    localSourcingPct: 62,
    renewableSource: '9.6 kW Foldable Solar Canopy + LiFePO4',
    sustainabilityNote:
      'Eliminates indoor kerosene soot exposure and disposable AA battery waste; LiFePO4 cells rated for 3,500+ charge cycles.',
    studyId: 'lantern',
    studyLabel: 'Preview Lantern Study',
    resources: [
      { qty: '120×', item: 'LiFePO4 Field Lantern Units', category: 'Lighting', spec: 'IP65 · 3,500 cycle cell' },
      { qty: '4×', item: 'Foldable 2.4 kW Solar Canopies', category: 'Energy', spec: '15-min rapid pitch' },
      { qty: '1×', item: 'DC Micro-Grid Charge Rack', category: 'Equipment', spec: '24-port smart load balance' },
      { qty: '2×', item: 'Community Energy Stewards', category: 'Personnel', spec: 'Swap-ledger operations' },
    ],
  },
  {
    id: 'prj-agr-08',
    code: 'PRJ-AGR-08',
    sector: 'agro',
    sectorLabel: 'Food & Agro-Ecology',
    region: 'Central America',
    priority: 'standard',
    priorityLabel: 'Standard',
    title: 'Watershed Slope-Stabilization Bio-Terraces',
    summary:
      'Contour vetiver-grass hedgerows, biodegradable coir erosion mats, and agroforestry saplings protecting hillside settlements from landslide runoff.',
    budgetUsdK: 114,
    timelineDays: 35,
    readinessPct: 76,
    carbonOffsetTons: 115,
    localSourcingPct: 92,
    renewableSource: 'Nature-Based Watershed Carbon Sink',
    sustainabilityNote:
      'Deep-rooting vetiver reaches 3 m depth within 12 months; 100% biodegradable coir mats break down into humic topsoil.',
    studyId: 'village',
    studyLabel: 'Preview Terrain Diorama',
    resources: [
      { qty: '18,000×', item: 'Native Vetiver & Legume Saplings', category: 'Ecology', spec: 'Regional nursery stock' },
      { qty: '240×', item: 'Biodegradable Coir Erosion Mats', category: 'Materials', spec: '700 g/m² woven coconut fiber' },
      { qty: '6×', item: 'Soil Moisture Telemetry Probes', category: 'Monitoring', spec: 'Solar LoRaWAN slope sensors' },
      { qty: '10×', item: 'Watershed Forestry Crew', category: 'Personnel', spec: 'Contour terracing lead' },
    ],
  },
]);

export function getHumanitarianRegions(projects = HUMANITARIAN_PROJECTS) {
  return Array.from(new Set(projects.map((p) => p.region))).sort((a, b) => a.localeCompare(b));
}

export function filterHumanitarianProjects(
  projects = HUMANITARIAN_PROJECTS,
  {
    sector = 'all',
    region = 'all',
    priority = 'all',
    query = '',
    sortBy = 'priority',
  } = {}
) {
  const q = String(query || '').trim().toLowerCase();

  const filtered = projects.filter((project) => {
    if (sector !== 'all' && project.sector !== sector) return false;
    if (region !== 'all' && project.region !== region) return false;
    if (priority !== 'all' && project.priority !== priority) return false;
    if (!q) return true;

    const haystack = [
      project.code,
      project.title,
      project.sectorLabel,
      project.region,
      project.priorityLabel,
      project.summary,
      project.renewableSource,
      project.sustainabilityNote,
      ...project.resources.map((r) => `${r.qty} ${r.item} ${r.category} ${r.spec}`),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'readiness':
        return b.readinessPct - a.readinessPct || a.timelineDays - b.timelineDays;
      case 'carbon-desc':
        return b.carbonOffsetTons - a.carbonOffsetTons || a.budgetUsdK - b.budgetUsdK;
      case 'timeline-asc':
        return a.timelineDays - b.timelineDays || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      case 'budget-asc':
        return a.budgetUsdK - b.budgetUsdK || b.readinessPct - a.readinessPct;
      case 'priority':
      default:
        return (
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
          a.timelineDays - b.timelineDays ||
          b.readinessPct - a.readinessPct
        );
    }
  });

  return sorted;
}

export function summarizeHumanitarianPortfolio(projects = []) {
  const list = Array.isArray(projects) ? projects : [];
  if (list.length === 0) {
    return {
      projectCount: 0,
      criticalCount: 0,
      totalBudgetUsdK: 0,
      totalCarbonOffsetTons: 0,
      avgReadinessPct: 0,
      avgLocalSourcingPct: 0,
      fastestDeployDays: 0,
      totalResourceItems: 0,
    };
  }

  let criticalCount = 0;
  let totalBudgetUsdK = 0;
  let totalCarbonOffsetTons = 0;
  let readinessSum = 0;
  let localSourcingSum = 0;
  let fastestDeployDays = Infinity;
  let totalResourceItems = 0;

  for (const p of list) {
    if (p.priority === 'critical') criticalCount += 1;
    totalBudgetUsdK += p.budgetUsdK;
    totalCarbonOffsetTons += p.carbonOffsetTons;
    readinessSum += p.readinessPct;
    localSourcingSum += p.localSourcingPct;
    if (p.timelineDays < fastestDeployDays) fastestDeployDays = p.timelineDays;
    totalResourceItems += Array.isArray(p.resources) ? p.resources.length : 0;
  }

  return {
    projectCount: list.length,
    criticalCount,
    totalBudgetUsdK,
    totalCarbonOffsetTons,
    avgReadinessPct: Math.round(readinessSum / list.length),
    avgLocalSourcingPct: Math.round(localSourcingSum / list.length),
    fastestDeployDays: Number.isFinite(fastestDeployDays) ? fastestDeployDays : 0,
    totalResourceItems,
  };
}

export function formatBudgetUsdK(budgetUsdK) {
  const n = Number(budgetUsdK) || 0;
  if (n >= 1000) {
    return `$${(n / 1000).toFixed(2)}M`;
  }
  return `$${Math.round(n)}K`;
}

export function buildProjectManifestCsv(project) {
  if (!project) return '';
  const escapeCsv = (val) => {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    'Project Code',
    'Project Title',
    'Sector',
    'Region',
    'Urgency',
    'Resource Qty',
    'Resource Item',
    'Resource Category',
    'Specification',
    'Renewable Source',
    'Local Sourcing %',
    'Carbon Offset (tCO2e/yr)',
  ];
  const rows = project.resources.map((r) => [
    project.code,
    project.title,
    project.sectorLabel,
    project.region,
    project.priorityLabel,
    r.qty,
    r.item,
    r.category,
    r.spec,
    project.renewableSource,
    `${project.localSourcingPct}%`,
    String(project.carbonOffsetTons),
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
}
