import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HUMANITARIAN_PROJECTS,
  filterHumanitarianProjects,
  summarizeHumanitarianPortfolio,
  formatBudgetUsdK,
  buildProjectManifestCsv,
} from '../landing/humanitarian-resources.js';

test('filterHumanitarianProjects filters accurately by sector, region, priority, and resource query', () => {
  const washOnly = filterHumanitarianProjects(HUMANITARIAN_PROJECTS, { sector: 'wash' });
  assert.equal(washOnly.length, 2);
  assert.ok(washOnly.every((p) => p.sector === 'wash'));

  const eastAfricaCritical = filterHumanitarianProjects(HUMANITARIAN_PROJECTS, {
    region: 'East Africa',
    priority: 'critical',
  });
  assert.equal(eastAfricaCritical.length, 1);
  assert.equal(eastAfricaCritical[0].code, 'PRJ-WSH-01');

  const queryMatch = filterHumanitarianProjects(HUMANITARIAN_PROJECTS, { query: 'LiFePO4' });
  assert.equal(queryMatch.length, 1);
  assert.equal(queryMatch[0].code, 'PRJ-ENG-07');

  const emptyMatch = filterHumanitarianProjects(HUMANITARIAN_PROJECTS, {
    sector: 'shelter',
    region: 'Andes',
  });
  assert.equal(emptyMatch.length, 0);
});

test('filterHumanitarianProjects sorts cleanly by readiness, carbon offset, timeline, and budget', () => {
  const byCarbon = filterHumanitarianProjects(HUMANITARIAN_PROJECTS, { sortBy: 'carbon-desc' });
  assert.ok(byCarbon[0].carbonOffsetTons >= byCarbon[byCarbon.length - 1].carbonOffsetTons);

  const byTimeline = filterHumanitarianProjects(HUMANITARIAN_PROJECTS, { sortBy: 'timeline-asc' });
  assert.ok(byTimeline[0].timelineDays <= byTimeline[byTimeline.length - 1].timelineDays);

  const byBudget = filterHumanitarianProjects(HUMANITARIAN_PROJECTS, { sortBy: 'budget-asc' });
  assert.ok(byBudget[0].budgetUsdK <= byBudget[byBudget.length - 1].budgetUsdK);
});

test('summarizeHumanitarianPortfolio computes accurate totals and handles empty lists', () => {
  const full = summarizeHumanitarianPortfolio(HUMANITARIAN_PROJECTS);
  assert.equal(full.projectCount, HUMANITARIAN_PROJECTS.length);
  assert.equal(full.criticalCount, 2);
  assert.ok(full.totalBudgetUsdK > 1000);
  assert.ok(full.totalCarbonOffsetTons > 350);
  assert.equal(formatBudgetUsdK(full.totalBudgetUsdK), '$1.12M');
  assert.equal(formatBudgetUsdK(148), '$148K');

  const empty = summarizeHumanitarianPortfolio([]);
  assert.equal(empty.projectCount, 0);
  assert.equal(empty.totalBudgetUsdK, 0);
  assert.equal(empty.avgReadinessPct, 0);
});

test('buildProjectManifestCsv generates valid CSV header and resource rows', () => {
  const csv = buildProjectManifestCsv(HUMANITARIAN_PROJECTS[0]);
  const lines = csv.split('\n');
  assert.equal(lines.length, HUMANITARIAN_PROJECTS[0].resources.length + 1);
  assert.ok(lines[0].includes('Project Code,Project Title,Sector'));
  assert.ok(lines[1].includes('PRJ-WSH-01'));
});
