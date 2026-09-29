import { renderToString } from 'react-dom/server';
import React from 'react';
import App from '../App';
import MarketTable from '../components/Table';
import { ClassBar, DepthSpreadScatter, FeeHistogram, SpreadHistogram, SpreadTierBox } from '../components/Charts';
import { ClassCards, DifferencePanel, DriversPanel, FeeInsight, Insights } from '../components/Panels';
import { SAMPLE_BOOKS } from '../lib/nobitex';
import { buildRows, classify, findDrivers, normalizeDepth, runGroupTests, summarize, summarizeClasses } from '../lib/analytics';

const rows = buildRows(SAMPLE_BOOKS);
const { usdtIrt } = normalizeDepth(rows);
classify(rows);
const summary = summarize(rows, usdtIrt);
const tests = runGroupTests(rows);
const drivers = findDrivers(rows);
const classes = summarizeClasses(rows);

const parts: [string, React.ReactElement][] = [
  ['App (empty state)', <App />],
  ['MarketTable', <MarketTable rows={rows} />],
  ['SpreadHistogram', <SpreadHistogram rows={rows} />],
  ['FeeHistogram', <FeeHistogram rows={rows} />],
  ['DepthSpreadScatter', <DepthSpreadScatter rows={rows} />],
  ['SpreadTierBox', <SpreadTierBox rows={rows} />],
  ['ClassBar', <ClassBar classes={classes} />],
  ['DifferencePanel', <DifferencePanel tests={tests} />],
  ['DriversPanel', <DriversPanel drivers={drivers} />],
  ['ClassCards', <ClassCards classes={classes} />],
  ['FeeInsight', <FeeInsight summary={summary} />],
  ['Insights', <Insights summary={summary} drivers={drivers} tests={tests} rows={rows} />],
];

for (const [name, el] of parts) {
  const html = renderToString(el);
  console.log(`✔ ${name.padEnd(22)} ${String(html.length).padStart(6)} chars`);
}
console.log('\nهمه کامپوننت‌ها بدون خطا رندر شدند.');
