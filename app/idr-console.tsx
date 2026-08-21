'use client';

import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Calculator,
  Check,
  ChevronDown,
  Database,
  FileSearch,
  Info,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

type RecordTuple = [
  number,
  number,
  number,
  number,
  number,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number,
  number,
  number,
  number,
  number,
  number | null,
  number | null,
  number | null,
];

type CodeInfo = {
  code: string;
  description: string;
  status: string;
  procedureId: string;
  procedureTitle: string;
  procedureDescription: string;
};

type SourceSummary = {
  year: number;
  quarter: number;
  file: string;
  scannedRows: number;
  matchedRows: number;
};

type IdrData = {
  generatedAt: string;
  recordColumns: string[];
  outcomes: string[];
  defaultValues: string[];
  dictionaries: {
    codes: CodeInfo[];
    regions: string[];
    entities: string[];
    places: string[];
    lineTypes: string[];
    initiatingParties: string[];
    modifiers: string[];
  };
  sources: SourceSummary[];
  records: RecordTuple[];
  notes: string[];
};

type BasicStats = {
  rows: number;
  providerWins: number;
  issuerWins: number;
  split: number;
  other: number;
  defaultWins: number;
  contestedRows: number;
  providerWinRate: number | null;
  amountRows: number;
  suppressedRows: number;
  qpaMedian: number | null;
  qpaP25: number | null;
  qpaP75: number | null;
  providerMedian: number | null;
  providerP25: number | null;
  providerP75: number | null;
  issuerMedian: number | null;
  issuerP25: number | null;
  issuerP75: number | null;
  prevailingMedian: number | null;
  providerQpaMedian: number | null;
  issuerQpaMedian: number | null;
  prevailingQpaMedian: number | null;
};

type ModelPoint = {
  amount: number;
  winProbability: number;
  expectedPayment: number;
  effectiveN: number;
  extrapolated: boolean;
};

type ModelResult = {
  points: ModelPoint[];
  recommended: ModelPoint | null;
  aggressive: ModelPoint | null;
  conservative: ModelPoint | null;
  modelRows: number;
  scope: string;
  includesDefaults: boolean;
  medianQpa: number | null;
  lossPayment: number | null;
  baseWinRate: number | null;
  amountMin: number;
  amountMax: number;
  defaultAmountMax: number;
  evidenceAmountMax: number;
  observedAmountMin: number;
  observedAmountMax: number;
};

type SegmentRow = {
  label: string;
  rows: number;
  providerWins: number;
  issuerWins: number;
  winRate: number | null;
  medianProvider: number | null;
  medianIssuer: number | null;
  medianPrevailing: number | null;
};

type OfferBucket = {
  index: number;
  label: string;
  rows: number;
  providerWins: number;
  issuerWins: number;
  winRate: number;
  minOffer: number;
  maxOffer: number;
  medianOffer: number;
};

type ResultsPage = 'strategy' | 'outcomes' | 'breakdowns' | 'comparables' | 'guide';

const ALL = '__all__';
const DEFAULT_CODE = '63047';
const DEFAULT_YEARS = [2023, 2024, 2025];
const ENTITY_ONLY_PERIOD_LABEL = '2025 Q3-Q4';
const ENTITY_NOT_REPORTED = 'Not reported in selected source';
const UNKNOWN_REGIONS = new Set(['N/R', 'NR', 'N/A']);
const STATE_NAMES: Record<string, string> = {
  AK: 'Alaska', AL: 'Alabama', AR: 'Arkansas', AZ: 'Arizona', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DC: 'District of Columbia', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', IA: 'Iowa', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  MA: 'Massachusetts', MD: 'Maryland', ME: 'Maine', MI: 'Michigan', MN: 'Minnesota',
  MO: 'Missouri', MS: 'Mississippi', MT: 'Montana', NC: 'North Carolina',
  ND: 'North Dakota', NE: 'Nebraska', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NV: 'Nevada', NY: 'New York', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
  UT: 'Utah', VA: 'Virginia', VT: 'Vermont', WA: 'Washington', WI: 'Wisconsin',
  WV: 'West Virginia', WY: 'Wyoming',
};
const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat('en-US');

function normalizeCode(value: string) {
  const trimmed = value.trim().toUpperCase();
  if (/^\d+$/.test(trimmed) && trimmed.length < 5) {
    return trimmed.padStart(5, '0');
  }
  return trimmed;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatMoney(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return 'N/R';
  return moneyFormatter.format(value);
}

function formatNumber(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return 'N/R';
  return numberFormatter.format(Math.round(value));
}

function formatRatio(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return 'N/R';
  if (value >= 100) return `${value.toFixed(0)}x`;
  if (value >= 10) return `${value.toFixed(1)}x`;
  return `${value.toFixed(2)}x`;
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load dataset (${response.status})`);
  return response.json() as Promise<T>;
}

function formatPercent(value: number | null | undefined, digits = 0) {
  if (!isFiniteNumber(value)) return 'N/R';
  if (value > 0 && value < 0.005 && digits === 0) return '<1%';
  return `${(value * 100).toFixed(digits)}%`;
}

function quantile(values: number[], percentile: number) {
  const clean = values.filter(isFiniteNumber).sort((a, b) => a - b);
  if (!clean.length) return null;
  const index = (clean.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return clean[lower];
  return clean[lower] + (clean[upper] - clean[lower]) * (index - lower);
}

function median(values: number[]) {
  return quantile(values, 0.5);
}

function roundOffer(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const step = value >= 1000000 ? 10000 : value >= 100000 ? 1000 : value >= 10000 ? 500 : 100;
  return Math.round(value / step) * step;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function regionStates(region: string) {
  if (UNKNOWN_REGIONS.has(region)) return [];
  const suffix = region.split(',').at(-1)?.trim() ?? '';
  if (!/^[A-Z]{2}(?:-[A-Z]{2})*$/.test(suffix)) return [];
  return suffix.split('-').filter((state) => state in STATE_NAMES);
}

function regionDisplayName(region: string) {
  const parts = region.split(',');
  if (parts.length < 2) return region;
  return `${parts.slice(0, -1).join(',')} (${parts.at(-1)?.trim()})`;
}

function summarize(records: RecordTuple[]): BasicStats {
  const qpas: number[] = [];
  const providerOffers: number[] = [];
  const issuerOffers: number[] = [];
  const prevailingOffers: number[] = [];
  const providerRatios: number[] = [];
  const issuerRatios: number[] = [];
  const prevailingRatios: number[] = [];
  let providerWins = 0;
  let issuerWins = 0;
  let split = 0;
  let other = 0;
  let defaultWins = 0;
  let suppressedRows = 0;

  for (const record of records) {
    if (record[10] === 0) providerWins += 1;
    else if (record[10] === 1) issuerWins += 1;
    else if (record[10] === 2) split += 1;
    else other += 1;
    if (record[11] === 1) defaultWins += 1;

    const qpa = record[6];
    const provider = record[7];
    const issuer = record[8];
    const prevailing = record[9];
    if (!isFiniteNumber(qpa) || !isFiniteNumber(provider) || !isFiniteNumber(issuer) || !isFiniteNumber(prevailing)) {
      suppressedRows += 1;
    }
    if (isFiniteNumber(qpa) && qpa > 0) qpas.push(qpa);
    if (isFiniteNumber(provider) && provider > 0) providerOffers.push(provider);
    if (isFiniteNumber(issuer) && issuer > 0) issuerOffers.push(issuer);
    if (isFiniteNumber(prevailing) && prevailing > 0) prevailingOffers.push(prevailing);
    if (isFiniteNumber(qpa) && qpa > 0 && isFiniteNumber(provider) && provider > 0) {
      providerRatios.push(provider / qpa);
    }
    if (isFiniteNumber(qpa) && qpa > 0 && isFiniteNumber(issuer) && issuer > 0) {
      issuerRatios.push(issuer / qpa);
    }
    if (isFiniteNumber(qpa) && qpa > 0 && isFiniteNumber(prevailing) && prevailing > 0) {
      prevailingRatios.push(prevailing / qpa);
    }
  }

  const contestedRows = providerWins + issuerWins;
  return {
    rows: records.length,
    providerWins,
    issuerWins,
    split,
    other,
    defaultWins,
    contestedRows,
    providerWinRate: contestedRows ? providerWins / contestedRows : null,
    amountRows: providerOffers.length,
    suppressedRows,
    qpaMedian: median(qpas),
    qpaP25: quantile(qpas, 0.25),
    qpaP75: quantile(qpas, 0.75),
    providerMedian: median(providerOffers),
    providerP25: quantile(providerOffers, 0.25),
    providerP75: quantile(providerOffers, 0.75),
    issuerMedian: median(issuerOffers),
    issuerP25: quantile(issuerOffers, 0.25),
    issuerP75: quantile(issuerOffers, 0.75),
    prevailingMedian: median(prevailingOffers),
    providerQpaMedian: median(providerRatios),
    issuerQpaMedian: median(issuerRatios),
    prevailingQpaMedian: median(prevailingRatios),
  };
}

function offerOutcomeRows(records: RecordTuple[]) {
  return records.filter(
    (record) =>
      (record[10] === 0 || record[10] === 1) &&
      isFiniteNumber(record[7]) &&
      record[7] > 0,
  );
}

function interpolatePoint(points: ModelPoint[], amount: number): ModelPoint | null {
  if (!points.length) return null;
  if (amount <= points[0].amount) return { ...points[0], amount };
  const last = points[points.length - 1];
  if (amount >= last.amount) return { ...last, amount };
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    const left = points[index - 1];
    if (amount <= right.amount) {
      const span = right.amount - left.amount || 1;
      const t = (amount - left.amount) / span;
      return {
        amount,
        winProbability: left.winProbability + (right.winProbability - left.winProbability) * t,
        expectedPayment: left.expectedPayment + (right.expectedPayment - left.expectedPayment) * t,
        effectiveN: left.effectiveN + (right.effectiveN - left.effectiveN) * t,
        extrapolated: left.extrapolated || right.extrapolated,
      };
    }
  }
  return { ...last, amount };
}

function chooseBest(points: ModelPoint[], minWinProbability: number) {
  const eligible = points.filter((point) => point.winProbability >= minWinProbability);
  return eligible.reduce<ModelPoint | null>((best, point) => {
    if (!best || point.expectedPayment > best.expectedPayment) return point;
    return best;
  }, null);
}

function buildModel(
  scopes: { label: string; records: RecordTuple[] }[],
  riskFloor: number,
  selectedCohortOffers: number[],
): ModelResult | null {
  let chosen:
    | {
        label: string;
        rows: RecordTuple[];
        includesDefaults: boolean;
      }
    | null = null;

  for (const scope of scopes) {
    const rows = offerOutcomeRows(scope.records);
    if (rows.length >= 25) {
      chosen = {
        label: scope.label,
        rows,
        includesDefaults: rows.some((record) => record[11] === 1),
      };
      break;
    }
    if (!chosen || rows.length > chosen.rows.length) {
      chosen = {
        label: scope.label,
        rows,
        includesDefaults: rows.some((record) => record[11] === 1),
      };
    }
  }

  if (!chosen || chosen.rows.length < 8) return null;

  const qpas = chosen.rows.map((record) => record[6]).filter(isFiniteNumber).filter((value) => value > 0);
  const issuerOffers = chosen.rows.map((record) => record[8]).filter(isFiniteNumber).filter((value) => value > 0);
  const providerOffers = chosen.rows.map((record) => record[7]).filter(isFiniteNumber).filter((value) => value > 0);
  const medianQpa = median(qpas);
  const lossPayment = median(issuerOffers) ?? 0;
  if (!providerOffers.length) return null;

  const wins = chosen.rows.filter((record) => record[10] === 0).length;
  const losses = chosen.rows.filter((record) => record[10] === 1).length;
  const baseWinRate = wins + losses ? wins / (wins + losses) : null;
  const rangeOffers = selectedCohortOffers.length ? selectedCohortOffers : providerOffers;
  const observedAmountMin = Math.min(...rangeOffers);
  const observedAmountMax = Math.max(...rangeOffers);
  const amountMin = observedAmountMin;
  const defaultAmountMax = Math.max(amountMin + 100, quantile(rangeOffers, 0.99) ?? observedAmountMax);
  const evidenceAmountMax = Math.max(defaultAmountMax, observedAmountMax);
  const amountMax = Math.max(evidenceAmountMax + 100, roundOffer(evidenceAmountMax * 1.25));
  const modelSamples = chosen.rows.map((record) => ({
    logAmount: Math.log(record[7] as number),
    providerWon: record[10] === 0 ? 1 : 0,
  }));
  const neighborCount = Math.min(modelSamples.length, Math.max(60, Math.ceil(modelSamples.length * 0.18)));
  const priorWeight = Math.min(20, Math.max(8, Math.sqrt(modelSamples.length) / 2));

  function localWinEstimate(amount: number) {
    const target = Math.log(Math.max(1, amount));
    const neighbors = modelSamples
      .map((sample) => ({ ...sample, distance: Math.abs(sample.logAmount - target) }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, neighborCount);
    const bandwidth = neighbors.at(-1)?.distance ?? 0;
    let weightedRows = 0;
    let weightedWins = 0;
    let squaredWeights = 0;

    for (const neighbor of neighbors) {
      const scaledDistance = bandwidth > 0 ? Math.min(1, neighbor.distance / bandwidth) : 0;
      const weight = Math.pow(1 - Math.pow(scaledDistance, 3), 3);
      weightedRows += weight;
      weightedWins += weight * neighbor.providerWon;
      squaredWeights += weight * weight;
    }

    const priorWins = (baseWinRate ?? 0.5) * priorWeight;
    return {
      probability: (weightedWins + priorWins) / Math.max(0.0001, weightedRows + priorWeight),
      effectiveN: squaredWeights > 0 ? (weightedRows * weightedRows) / squaredWeights : 0,
    };
  }

  const candidateAmounts = new Set<number>([amountMin, defaultAmountMax, evidenceAmountMax, amountMax]);
  for (let index = 0; index < 160; index += 1) {
    const t = index / 159;
    candidateAmounts.add(roundOffer(amountMin + (evidenceAmountMax - amountMin) * t));
  }
  for (let index = 1; index < 80; index += 1) {
    const t = index / 79;
    candidateAmounts.add(roundOffer(evidenceAmountMax + (amountMax - evidenceAmountMax) * t));
  }
  for (const percentile of [0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]) {
    const offer = quantile(rangeOffers, percentile);
    if (offer) candidateAmounts.add(roundOffer(offer));
  }

  const tailSpan = Math.max(1, amountMax - evidenceAmountMax);
  const boundaryEstimate = localWinEstimate(evidenceAmountMax);
  const points = Array.from(candidateAmounts)
    .filter((amount) => amount > 0 && amount <= amountMax)
    .sort((a, b) => a - b)
    .map((amount) => {
      const extrapolated = amount > evidenceAmountMax;
      const progress = extrapolated ? Math.min(1, (amount - evidenceAmountMax) / tailSpan) : 0;
      const smoothProgress = progress * progress * (3 - 2 * progress);
      const localEstimate = extrapolated ? boundaryEstimate : localWinEstimate(amount);
      const winProbability = extrapolated
        ? localEstimate.probability * (1 - smoothProgress)
        : localEstimate.probability;
      const expectedPayment = winProbability * amount + (1 - winProbability) * lossPayment;
      const effectiveN = extrapolated ? localEstimate.effectiveN * (1 - smoothProgress) : localEstimate.effectiveN;
      return { amount, winProbability, expectedPayment, effectiveN, extrapolated };
    });

  const recommendationPool = points.filter(
    (point) => !point.extrapolated && point.amount <= defaultAmountMax,
  );
  const recommended = chooseBest(recommendationPool, riskFloor);
  const aggressive = chooseBest(recommendationPool, 0);
  const conservative = chooseBest(recommendationPool, Math.max(riskFloor, 0.8));

  return {
    points,
    recommended,
    aggressive,
    conservative,
    modelRows: chosen.rows.length,
    scope: chosen.label,
    includesDefaults: chosen.includesDefaults,
    medianQpa,
    lossPayment,
    baseWinRate,
    amountMin,
    amountMax,
    defaultAmountMax,
    evidenceAmountMax,
    observedAmountMin,
    observedAmountMax,
  };
}

function groupSegments(
  records: RecordTuple[],
  getLabel: (record: RecordTuple) => string,
  limit = 8,
): SegmentRow[] {
  const groups = new Map<string, RecordTuple[]>();
  for (const record of records) {
    const label = getLabel(record);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)?.push(record);
  }
  return Array.from(groups.entries())
    .map(([label, rows]) => {
      const stats = summarize(rows);
      return {
        label,
        rows: rows.length,
        providerWins: stats.providerWins,
        issuerWins: stats.issuerWins,
        winRate: stats.providerWinRate,
        medianProvider: stats.providerMedian,
        medianIssuer: stats.issuerMedian,
        medianPrevailing: stats.prevailingMedian,
      };
    })
    .sort((a, b) => b.rows - a.rows)
    .slice(0, limit);
}

function buildOfferBuckets(records: RecordTuple[], bucketCount = 6): OfferBucket[] {
  const rows = offerOutcomeRows(records).sort(
    (left, right) => (left[7] as number) - (right[7] as number),
  );
  if (rows.length < bucketCount) return [];

  return Array.from({ length: bucketCount }, (_, index) => {
    const start = Math.floor((index * rows.length) / bucketCount);
    const end = Math.floor(((index + 1) * rows.length) / bucketCount);
    const bucketRows = rows.slice(start, end);
    const offers = bucketRows.map((record) => record[7] as number);
    const providerWins = bucketRows.filter((record) => record[10] === 0).length;
    const issuerWins = bucketRows.length - providerWins;
    const position = index === 0 ? 'Lowest' : index === bucketCount - 1 ? 'Highest' : '';

    return {
      index,
      label: position ? `Bucket ${index + 1} - ${position}` : `Bucket ${index + 1}`,
      rows: bucketRows.length,
      providerWins,
      issuerWins,
      winRate: providerWins / bucketRows.length,
      minOffer: offers[0],
      maxOffer: offers[offers.length - 1],
      medianOffer: median(offers) ?? offers[0],
    };
  });
}

function Metric({
  label,
  value,
  helper,
  tone = 'plain',
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: 'plain' | 'accent' | 'warn';
}) {
  const border = tone === 'accent' ? 'border-teal-300' : tone === 'warn' ? 'border-amber-300' : 'border-slate-200';
  return (
    <div className={`rounded-lg border ${border} bg-white p-4 shadow-sm`}>
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      {helper ? <p className="mt-2 text-sm leading-5 text-slate-500">{helper}</p> : null}
    </div>
  );
}

function SegmentTable({ title, rows }: { title: string; rows: SegmentRow[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="py-2 pr-3 font-semibold">Segment</th>
              <th className="px-3 py-2 text-right font-semibold">Rows</th>
              <th className="px-3 py-2 text-right font-semibold">Provider</th>
              <th className="px-3 py-2 text-right font-semibold">Plan</th>
              <th className="px-3 py-2 text-right font-semibold">Win rate</th>
              <th className="px-3 py-2 text-right font-semibold">Median provider</th>
              <th className="py-2 pl-3 text-right font-semibold">Median prevailing</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.label} className="border-b border-slate-100 last:border-0">
                  <th className="max-w-[220px] py-2 pr-3 font-medium text-slate-700">{row.label}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.rows)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.providerWins)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.issuerWins)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPercent(row.winRate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.medianProvider)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums">{formatMoney(row.medianPrevailing)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-4 text-slate-500" colSpan={7}>
                  No rows for this segment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OfferBucketChart({ records }: { records: RecordTuple[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const buckets = useMemo(() => buildOfferBuckets(records), [records]);

  if (!buckets.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">
        At least six exact-filter cases with a reported provider offer and provider/plan outcome are required.
      </div>
    );
  }

  const width = 920;
  const height = 430;
  const padLeft = 84;
  const padRight = 72;
  const padTop = 62;
  const padBottom = 94;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;
  const plotBottom = padTop + chartHeight;
  const bucketWidth = chartWidth / buckets.length;
  const barWidth = Math.min(72, bucketWidth * 0.52);
  const largestMedian = Math.max(...buckets.map((bucket) => bucket.medianOffer));
  const amountAxisMax = Math.max(largestMedian, roundOffer(largestMedian * 1.12));
  const xFor = (index: number) => padLeft + bucketWidth * (index + 0.5);
  const amountYFor = (amount: number) => plotBottom - (amount / amountAxisMax) * chartHeight;
  const winYFor = (rate: number) => plotBottom - rate * chartHeight;
  const linePoints = buckets.map((bucket) => `${xFor(bucket.index)},${winYFor(bucket.winRate)}`).join(' ');
  const activeBucket = activeIndex === null ? null : buckets[activeIndex];
  const activeX = activeBucket ? xFor(activeBucket.index) : 0;
  const tooltipWidth = 246;
  const tooltipHeight = 132;
  const tooltipX = Math.min(width - padRight - tooltipWidth, Math.max(padLeft, activeX - tooltipWidth / 2));
  const tooltipY = padTop + 8;

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto min-w-[760px] w-full"
          role="img"
          aria-label="Six provider-offer buckets comparing median provider offer amount with observed provider win rate"
          onMouseLeave={() => setActiveIndex(null)}
        >
          <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
          <text x={padLeft} y="26" fontSize="12" fontWeight="700" fill="#475569">
            Median provider offer
          </text>
          <text x={width - padRight} y="26" textAnchor="end" fontSize="12" fontWeight="700" fill="#0f766e">
            Provider win rate
          </text>

          {Array.from({ length: 5 }, (_, index) => {
            const fraction = index / 4;
            const y = plotBottom - fraction * chartHeight;
            return (
              <g key={fraction}>
                <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#e2e8f0" />
                <text x={padLeft - 12} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                  {formatMoney(amountAxisMax * fraction)}
                </text>
                <text x={width - padRight + 12} y={y + 4} fontSize="11" fill="#0f766e">
                  {formatPercent(fraction)}
                </text>
              </g>
            );
          })}

          {buckets.map((bucket) => {
            const x = xFor(bucket.index);
            const barY = amountYFor(bucket.medianOffer);
            const active = activeIndex === bucket.index;
            const shortLabel = bucket.index === 0 ? '1 - Lowest' : bucket.index === buckets.length - 1 ? '6 - Highest' : `${bucket.index + 1}`;
            return (
              <g
                key={bucket.index}
                tabIndex={0}
                role="button"
                aria-label={`${bucket.label}: median offer ${formatMoney(bucket.medianOffer)}, provider win rate ${formatPercent(bucket.winRate, 1)}, ${formatNumber(bucket.rows)} cases`}
                onMouseEnter={() => setActiveIndex(bucket.index)}
                onFocus={() => setActiveIndex(bucket.index)}
                onBlur={() => setActiveIndex(null)}
                onClick={() => setActiveIndex(bucket.index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setActiveIndex(bucket.index);
                  }
                }}
                className="cursor-pointer outline-none"
              >
                <rect
                  x={x - bucketWidth / 2 + 2}
                  y={padTop}
                  width={bucketWidth - 4}
                  height={chartHeight}
                  fill="transparent"
                />
                <rect
                  x={x - barWidth / 2}
                  y={barY}
                  width={barWidth}
                  height={Math.max(1, plotBottom - barY)}
                  rx="3"
                  fill={active ? '#334155' : '#64748b'}
                  opacity={active ? 1 : 0.82}
                />
                <text x={x} y={plotBottom + 25} textAnchor="middle" fontSize="12" fontWeight="700" fill="#334155">
                  {shortLabel}
                </text>
                <text x={x} y={plotBottom + 45} textAnchor="middle" fontSize="11" fill="#64748b">
                  {formatMoney(bucket.medianOffer)} median
                </text>
              </g>
            );
          })}

          <polyline points={linePoints} fill="none" stroke="#0f766e" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
          {buckets.map((bucket) => {
            const x = xFor(bucket.index);
            const y = winYFor(bucket.winRate);
            return (
              <g key={`rate-${bucket.index}`} pointerEvents="none">
                <circle cx={x} cy={y} r={activeIndex === bucket.index ? 7 : 5.5} fill="#ffffff" stroke="#0f766e" strokeWidth="3" />
                <text x={x} y={Math.max(padTop + 12, y - 12)} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0f766e">
                  {formatPercent(bucket.winRate, 1)}
                </text>
              </g>
            );
          })}

          {activeBucket ? (
            <g pointerEvents="none">
              <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="6" fill="#0f172a" opacity="0.97" />
              <text x={tooltipX + 14} y={tooltipY + 24} fontSize="13" fontWeight="700" fill="#ffffff">
                {activeBucket.label}
              </text>
              <text x={tooltipX + 14} y={tooltipY + 47} fontSize="12" fill="#cbd5e1">
                Offer range: {formatMoney(activeBucket.minOffer)} to {formatMoney(activeBucket.maxOffer)}
              </text>
              <text x={tooltipX + 14} y={tooltipY + 68} fontSize="12" fill="#cbd5e1">
                Median offer: {formatMoney(activeBucket.medianOffer)}
              </text>
              <text x={tooltipX + 14} y={tooltipY + 89} fontSize="12" fill="#cbd5e1">
                Provider / plan wins: {formatNumber(activeBucket.providerWins)} / {formatNumber(activeBucket.issuerWins)}
              </text>
              <text x={tooltipX + 14} y={tooltipY + 112} fontSize="13" fontWeight="700" fill="#5eead4">
                {formatPercent(activeBucket.winRate, 1)} provider win rate
              </text>
            </g>
          ) : null}
        </svg>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
        <span><span className="mr-2 inline-block h-2.5 w-5 rounded-sm bg-slate-500 align-middle" />Median provider offer</span>
        <span><span className="mr-2 inline-block h-0.5 w-6 bg-teal-700 align-middle" />Observed provider win rate</span>
        <span>{formatNumber(buckets.reduce((sum, bucket) => sum + bucket.rows, 0))} exact-filter cases divided by offer rank</span>
      </div>

      <div className="overflow-x-auto border-t border-slate-100 px-4 pb-3">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="py-2 pr-3 font-semibold">Bucket</th>
              <th className="px-3 py-2 text-right font-semibold">Offer range</th>
              <th className="px-3 py-2 text-right font-semibold">Median offer</th>
              <th className="px-3 py-2 text-right font-semibold">Cases</th>
              <th className="px-3 py-2 text-right font-semibold">Provider wins</th>
              <th className="px-3 py-2 text-right font-semibold">Plan wins</th>
              <th className="py-2 pl-3 text-right font-semibold">Win rate</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.index} className="border-b border-slate-100 last:border-0">
                <th className="py-2 pr-3 font-medium text-slate-700">{bucket.label}</th>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(bucket.minOffer)} to {formatMoney(bucket.maxOffer)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(bucket.medianOffer)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(bucket.rows)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-green-700">{formatNumber(bucket.providerWins)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-700">{formatNumber(bucket.issuerWins)}</td>
                <td className="py-2 pl-3 text-right font-semibold tabular-nums text-teal-800">{formatPercent(bucket.winRate, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OutcomeCasePlot({ records, data }: { records: RecordTuple[]; data: IdrData }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const outcomeRows = useMemo(
    () =>
      records.filter(
        (record) =>
          (record[10] === 0 || record[10] === 1) &&
          isFiniteNumber(record[7]) &&
          record[7] > 0,
      ),
    [records],
  );

  if (!outcomeRows.length) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500">
        No exact-filter rows report both a provider offer and a provider/plan outcome.
      </div>
    );
  }

  const width = 920;
  const height = 350;
  const padLeft = 116;
  const padRight = 32;
  const padTop = 28;
  const padBottom = 58;
  const chartWidth = width - padLeft - padRight;
  const minOffer = Math.min(...outcomeRows.map((record) => record[7] as number));
  const rawMaxOffer = Math.max(...outcomeRows.map((record) => record[7] as number));
  const maxOffer = rawMaxOffer > minOffer ? rawMaxOffer : minOffer + 1;
  const providerY = 100;
  const issuerY = 222;
  const xFor = (amount: number) => padLeft + ((amount - minOffer) / (maxOffer - minOffer)) * chartWidth;
  const yFor = (record: RecordTuple, index: number) => {
    const lane = record[10] === 0 ? providerY : issuerY;
    const jitter = (((index * 37) % 25) - 12) * 1.55;
    return lane + jitter;
  };
  const providerWins = outcomeRows.filter((record) => record[10] === 0).length;
  const issuerWins = outcomeRows.length - providerWins;
  const pointRadius = outcomeRows.length > 1800 ? 3 : outcomeRows.length > 700 ? 3.5 : 4.5;
  const xTicks = Array.from({ length: 5 }, (_, index) => minOffer + ((maxOffer - minOffer) * index) / 4);
  const hoverRecord = hoverIndex === null ? null : outcomeRows[hoverIndex];
  const hoverX = hoverRecord ? xFor(hoverRecord[7] as number) : 0;
  const hoverY = hoverRecord && hoverIndex !== null ? yFor(hoverRecord, hoverIndex) : 0;
  const tooltipWidth = 336;
  const tooltipHeight = 198;
  const tooltipX = hoverX > width - tooltipWidth - 24 ? hoverX - tooltipWidth - 12 : hoverX + 12;
  const tooltipY = Math.max(8, Math.min(height - tooltipHeight - 8, hoverY - tooltipHeight / 2));
  const tooltipLines = hoverRecord
    ? [
        `${hoverRecord[3]} Q${hoverRecord[4]} | Service year ${hoverRecord[15] ?? 'N/R'} | POS ${data.dictionaries.places[hoverRecord[5]] ?? 'N/R'}`,
        `Provider offer: ${formatMoney(hoverRecord[7])}`,
        `QPA: ${formatMoney(hoverRecord[6])} | Plan: ${formatMoney(hoverRecord[8])}`,
        `Prevailing: ${formatMoney(hoverRecord[9])} | Initial payment: ${formatMoney(hoverRecord[17])}`,
        `Cost sharing: ${formatMoney(hoverRecord[16])}`,
        `Region: ${data.dictionaries.regions[hoverRecord[1]] ?? 'N/R'}`,
        `Entity: ${data.dictionaries.entities[hoverRecord[2]] ?? 'N/R'}`,
        `Line: ${data.dictionaries.lineTypes[hoverRecord[12]] ?? 'N/R'} | Initiated by: ${data.dictionaries.initiatingParties[hoverRecord[13]] ?? 'N/R'}`,
        `Modifier: ${data.dictionaries.modifiers[hoverRecord[14]] ?? 'N/R'} | Default: ${data.defaultValues[hoverRecord[11]] ?? 'unknown'}`,
      ]
    : [];

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <svg
        className="min-w-[760px]"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Historical exact-filter provider and plan wins plotted by provider offer amount"
        onPointerLeave={() => setHoverIndex(null)}
      >
        <rect width={width} height={height} fill="#ffffff" />
        <rect x={padLeft} y={providerY - 31} width={chartWidth} height="62" fill="#f0fdf4" />
        <rect x={padLeft} y={issuerY - 31} width={chartWidth} height="62" fill="#fef2f2" />
        <text x={padLeft - 14} y={providerY + 4} textAnchor="end" className="fill-green-800 text-[12px] font-semibold">
          Provider won
        </text>
        <text x={padLeft - 14} y={issuerY + 4} textAnchor="end" className="fill-red-800 text-[12px] font-semibold">
          Plan won
        </text>
        {xTicks.map((tick, index) => (
          <g key={`${tick}-${index}`}>
            <line x1={xFor(tick)} x2={xFor(tick)} y1={padTop} y2={height - padBottom} stroke="#e2e8f0" />
            <text
              x={xFor(tick)}
              y={height - 31}
              textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}
              className="fill-slate-500 text-[11px]"
            >
              {formatMoney(tick)}
            </text>
          </g>
        ))}
        {outcomeRows.map((record, index) => (
          <circle
            key={index}
            cx={xFor(record[7] as number)}
            cy={yFor(record, index)}
            r={hoverIndex === index ? pointRadius + 2 : pointRadius}
            fill={record[10] === 0 ? '#15803d' : '#dc2626'}
            fillOpacity={hoverIndex === index ? 1 : 0.72}
            stroke={hoverIndex === index ? '#ffffff' : 'none'}
            strokeWidth="2"
            onPointerEnter={() => setHoverIndex(index)}
            onPointerMove={() => setHoverIndex(index)}
          />
        ))}
        {hoverRecord ? (
          <g pointerEvents="none">
            <line x1={hoverX} x2={hoverX} y1={padTop} y2={height - padBottom} stroke="#475569" strokeDasharray="4 4" />
            <circle cx={hoverX} cy={hoverY} r={pointRadius + 3} fill="none" stroke="#0f172a" strokeWidth="2" />
            <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="6" fill="#0f172a" />
            <text x={tooltipX + 12} y={tooltipY + 21} className="fill-white text-[12px] font-semibold">
              {hoverRecord[10] === 0 ? 'Provider win' : 'Plan win'}
            </text>
            {tooltipLines.map((line, index) => (
              <text key={line} x={tooltipX + 12} y={tooltipY + 42 + index * 17} className="fill-slate-200 text-[11px]">
                {line.length > 54 ? `${line.slice(0, 53)}...` : line}
              </text>
            ))}
          </g>
        ) : null}
        <text x={width / 2} y={height - 8} textAnchor="middle" className="fill-slate-600 text-[12px] font-semibold">
          Actual provider offer in each reported case
        </text>
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
        <span><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-green-700" />{formatNumber(providerWins)} provider wins</span>
        <span><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-red-600" />{formatNumber(issuerWins)} plan wins</span>
        <span>{formatNumber(outcomeRows.length)} exact-filter rows with reported offers</span>
      </div>
    </div>
  );
}

function OfferCurve({
  model,
  riskFloor,
  selectedPoint,
  onSelectAmount,
  axisMax,
  showExtrapolation,
  onAxisMaxChange,
}: {
  model: ModelResult | null;
  riskFloor: number;
  selectedPoint: ModelPoint | null;
  onSelectAmount: (amount: number) => void;
  axisMax: number;
  showExtrapolation: boolean;
  onAxisMaxChange: (amount: number) => void;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [editingAxisMax, setEditingAxisMax] = useState(false);
  const [axisDraft, setAxisDraft] = useState('');

  if (!model || !model.points.length) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500">
        Not enough provider-offer outcome rows for an offer curve.
      </div>
    );
  }

  const width = 920;
  const height = 360;
  const padLeft = 64;
  const padRight = 28;
  const padTop = 24;
  const padBottom = 54;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;
  const minAmount = model.amountMin;
  const maxAmount = Math.max(minAmount + 1, axisMax);
  const xFor = (amount: number) => padLeft + ((amount - minAmount) / (maxAmount - minAmount)) * chartWidth;
  const yFor = (probability: number) => padTop + (1 - probability) * chartHeight;
  const visiblePoints = model.points.filter((point) => point.amount <= maxAmount);
  const endpoint = interpolatePoint(model.points, maxAmount);
  if (endpoint && !visiblePoints.some((point) => point.amount === maxAmount)) visiblePoints.push(endpoint);
  visiblePoints.sort((a, b) => a.amount - b.amount);
  const supportedPoints = visiblePoints.filter((point) => !point.extrapolated);
  const extrapolatedPoints = showExtrapolation ? visiblePoints.filter((point) => point.extrapolated) : [];
  const boundaryPoint = supportedPoints.at(-1);
  const solidLine = supportedPoints.map((point) => `${xFor(point.amount)},${yFor(point.winProbability)}`).join(' ');
  const dashedLine = [boundaryPoint, ...extrapolatedPoints]
    .filter((point): point is ModelPoint => Boolean(point))
    .map((point) => `${xFor(point.amount)},${yFor(point.winProbability)}`)
    .join(' ');
  const hoverPoint = hoverIndex === null ? null : visiblePoints[hoverIndex];
  const focusPoint = hoverPoint ?? (selectedPoint && selectedPoint.amount <= maxAmount ? selectedPoint : null);
  const riskY = yFor(riskFloor);
  const xTicks = Array.from({ length: 5 }, (_, index) => minAmount + ((maxAmount - minAmount) * index) / 4);

  function updateHover(clientX: number, bounds: DOMRect) {
    const svgX = ((clientX - bounds.left) / bounds.width) * width;
    const position = Math.min(1, Math.max(0, (svgX - padLeft) / chartWidth));
    const amount = minAmount + position * (maxAmount - minAmount);
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    visiblePoints.forEach((point, index) => {
      const distance = Math.abs(point.amount - amount);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    setHoverIndex(closestIndex);
  }

  const tooltipX = focusPoint ? xFor(focusPoint.amount) : 0;
  const tooltipY = focusPoint ? yFor(focusPoint.winProbability) : 0;
  const tooltipLeft = tooltipX > width - 250 ? tooltipX - 208 : tooltipX + 14;
  const tooltipTop = Math.max(10, Math.min(height - 108, tooltipY - 84));

  function commitAxisMax() {
    const parsed = Number(axisDraft.replace(/[$,\s]/g, ''));
    if (Number.isFinite(parsed) && parsed > minAmount) onAxisMaxChange(parsed);
    setEditingAxisMax(false);
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <svg
        className="min-w-[760px] touch-none"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Estimated provider win probability by proposed offer amount on a linear dollar axis"
        onPointerMove={(event) => updateHover(event.clientX, event.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHoverIndex(null)}
        onPointerDown={(event) => updateHover(event.clientX, event.currentTarget.getBoundingClientRect())}
        onClick={() => {
          if (hoverPoint) onSelectAmount(hoverPoint.amount);
        }}
      >
        <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line x1={padLeft} x2={width - padRight} y1={yFor(tick)} y2={yFor(tick)} stroke="#e2e8f0" />
            <text x={padLeft - 12} y={yFor(tick) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
              {formatPercent(tick)}
            </text>
          </g>
        ))}
        {showExtrapolation && maxAmount > model.evidenceAmountMax ? (
          <rect
            x={xFor(model.evidenceAmountMax)}
            y={padTop}
            width={Math.max(0, width - padRight - xFor(model.evidenceAmountMax))}
            height={chartHeight}
            fill="#f8fafc"
          />
        ) : null}
        <line x1={padLeft} x2={width - padRight} y1={riskY} y2={riskY} stroke="#d97706" strokeDasharray="5 5" />
        <text x={width - padRight} y={riskY - 7} textAnchor="end" className="fill-amber-700 text-[11px] font-semibold">
          {formatPercent(riskFloor)} floor
        </text>
        {showExtrapolation && maxAmount > model.evidenceAmountMax ? (
          <>
            <line
              x1={xFor(model.evidenceAmountMax)}
              x2={xFor(model.evidenceAmountMax)}
              y1={padTop}
              y2={height - padBottom}
              stroke="#94a3b8"
              strokeDasharray="3 5"
            />
            <text
              x={Math.min(width - padRight - 4, xFor(model.evidenceAmountMax) + 8)}
              y={padTop + 14}
              className="fill-slate-500 text-[11px] font-semibold"
            >
              Extrapolated
            </text>
          </>
        ) : null}
        <polyline points={solidLine} fill="none" stroke="#0f766e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <polyline
          points={dashedLine}
          fill="none"
          stroke="#0f766e"
          strokeWidth="3"
          strokeDasharray="7 7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {focusPoint ? (
          <g>
            <line x1={tooltipX} x2={tooltipX} y1={padTop} y2={height - padBottom} stroke="#64748b" strokeDasharray="4 4" />
            <circle cx={tooltipX} cy={tooltipY} r="6" fill="#0f766e" stroke="#ffffff" strokeWidth="2" />
            <rect x={tooltipLeft} y={tooltipTop} width="196" height="76" rx="6" fill="#0f172a" />
            <text x={tooltipLeft + 12} y={tooltipTop + 22} className="fill-white text-[13px] font-semibold">
              {formatMoney(focusPoint.amount)}
            </text>
            <text x={tooltipLeft + 12} y={tooltipTop + 43} className="fill-slate-200 text-[12px]">
              {formatPercent(focusPoint.winProbability, 1)} estimated win rate
            </text>
            <text x={tooltipLeft + 12} y={tooltipTop + 61} className="fill-slate-300 text-[11px]">
              Local effective sample: {formatNumber(focusPoint.effectiveN)}
            </text>
          </g>
        ) : null}
        {xTicks.map((tick, index) =>
          editingAxisMax && index === xTicks.length - 1 ? (
            <foreignObject key="axis-editor" x={width - padRight - 116} y={height - 48} width="116" height="34">
              <input
                autoFocus
                value={axisDraft}
                aria-label="Offer curve maximum amount"
                onChange={(event) => setAxisDraft(event.target.value)}
                onBlur={commitAxisMax}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitAxisMax();
                  if (event.key === 'Escape') setEditingAxisMax(false);
                }}
                className="h-7 w-full rounded border border-teal-600 bg-white px-2 text-right text-[11px] text-slate-800 outline-none ring-2 ring-teal-100"
              />
            </foreignObject>
          ) : (
            <text
              key={`${tick}-${index}`}
              x={xFor(tick)}
              y={height - 28}
              textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}
              className={index === xTicks.length - 1 ? 'cursor-text fill-slate-700 text-[11px] font-semibold' : 'fill-slate-500 text-[11px]'}
              onPointerDown={index === xTicks.length - 1 ? (event) => event.stopPropagation() : undefined}
              onClick={index === xTicks.length - 1 ? (event) => event.stopPropagation() : undefined}
              onDoubleClick={
                index === xTicks.length - 1
                  ? (event) => {
                      event.stopPropagation();
                      setAxisDraft(String(Math.round(maxAmount)));
                      setEditingAxisMax(true);
                    }
                  : undefined
              }
            >
              {index === xTicks.length - 1 ? <title>Double-click to edit the axis maximum</title> : null}
              {formatMoney(tick)}
            </text>
          ),
        )}
        <text x={width / 2} y={height - 8} textAnchor="middle" className="fill-slate-600 text-[12px] font-semibold">
          Proposed provider offer (linear scale)
        </text>
      </svg>
    </div>
  );
}

function RegionCheckboxDropdown({
  stateName,
  options,
  selected,
  onChange,
}: {
  stateName: string | null;
  options: string[];
  selected: Set<string>;
  onChange: (regions: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const disabled = !stateName;
  const selectedRegions = Array.from(selected);
  const buttonLabel = disabled
    ? 'Select a state first'
    : selectedRegions.length === 0
      ? `All ${stateName} regions`
      : selectedRegions.length === 1
        ? regionDisplayName(selectedRegions[0])
        : `${selectedRegions.length} ${stateName} regions selected`;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function toggleRegion(region: string) {
    const next = new Set(selected);
    if (next.has(region)) next.delete(region);
    else next.add(region);
    onChange(next);
  }

  return (
    <div ref={containerRef} className="relative mt-2">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-3 text-left text-sm outline-none transition hover:border-slate-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        <span className="min-w-0 truncate">{buttonLabel}</span>
        <ChevronDown size={17} className={`shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && !disabled ? (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl" role="dialog" aria-label={`${stateName} regions`}>
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-slate-800">Select regions</p>
              <p className="text-xs text-slate-500">Checked regions are combined</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close region menu"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={selected.size === 0}
                onChange={() => onChange(new Set())}
                className="h-4 w-4 accent-teal-700"
              />
              All {stateName} regions
            </label>
            <div className="my-1 border-t border-slate-100" />
            {options.map((region) => (
              <label key={region} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.has(region)}
                  onChange={() => toggleRegion(region)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
                />
                <span className="leading-5">{regionDisplayName(region)}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span>{selected.size ? `${selected.size} selected` : 'All regions included'}</span>
            {selected.size ? (
              <button type="button" onClick={() => onChange(new Set())} className="font-semibold text-teal-800 hover:text-teal-950">
                Use all regions
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function IdrConsole() {
  const [data, setData] = useState<IdrData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState(DEFAULT_CODE);
  const [selectedState, setSelectedState] = useState(ALL);
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [selectedEntity, setSelectedEntity] = useState(ALL);
  const [selectedPlace, setSelectedPlace] = useState(ALL);
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set(DEFAULT_YEARS));
  const [entityOnlyPeriods, setEntityOnlyPeriods] = useState(false);
  const [riskFloorPct, setRiskFloorPct] = useState(70);
  const [offerAmount, setOfferAmount] = useState<number | null>(null);
  const [showExtrapolation, setShowExtrapolation] = useState(false);
  const [axisMaxOverride, setAxisMaxOverride] = useState<number | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [activePage, setActivePage] = useState<ResultsPage>('strategy');

  useEffect(() => {
    let cancelled = false;
    readJson<IdrData>('./idr-data.json')
      .then((payload: IdrData) => {
        if (!cancelled) setData(payload);
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const indexes = useMemo(() => {
    if (!data) return null;
    const codeToIndex = new Map<string, number>();
    const recordsByCode = new Map<number, RecordTuple[]>();
    const recordsByProcedure = new Map<string, RecordTuple[]>();
    data.dictionaries.codes.forEach((code, index) => {
      codeToIndex.set(code.code, index);
    });
    data.records.forEach((record) => {
      if (!recordsByCode.has(record[0])) recordsByCode.set(record[0], []);
      recordsByCode.get(record[0])?.push(record);
      const procedureId = data.dictionaries.codes[record[0]]?.procedureId ?? '';
      if (!recordsByProcedure.has(procedureId)) recordsByProcedure.set(procedureId, []);
      recordsByProcedure.get(procedureId)?.push(record);
    });
    return { codeToIndex, recordsByCode, recordsByProcedure };
  }, [data]);

  const normalizedCode = normalizeCode(codeInput);
  const selectedCodeIndex = indexes?.codeToIndex.get(normalizedCode);
  const selectedCodeInfo = selectedCodeIndex !== undefined && data ? data.dictionaries.codes[selectedCodeIndex] : null;
  const codeRecords = useMemo(
    () => (selectedCodeIndex !== undefined ? indexes?.recordsByCode.get(selectedCodeIndex) ?? [] : []),
    [indexes, selectedCodeIndex],
  );
  const selectedYearsArray = useMemo(() => Array.from(selectedYears).sort(), [selectedYears]);
  const selectedPeriodLabel = entityOnlyPeriods ? ENTITY_ONLY_PERIOD_LABEL : selectedYearsArray.join(', ');

  const yearRecords = useMemo(
    () =>
      codeRecords.filter((record) => {
        if (entityOnlyPeriods) return record[3] === 2025 && (record[4] === 3 || record[4] === 4);
        return selectedYears.has(record[3]);
      }),
    [codeRecords, entityOnlyPeriods, selectedYears],
  );

  const regionOptions = useMemo(() => {
    if (!data) return [];
    return uniqueSorted(data.dictionaries.regions.filter((region) => !UNKNOWN_REGIONS.has(region)));
  }, [data]);

  const regionsByState = useMemo(() => {
    const map = new Map<string, string[]>();
    regionOptions.forEach((region) => {
      regionStates(region).forEach((state) => {
        if (!map.has(state)) map.set(state, []);
        map.get(state)?.push(region);
      });
    });
    map.forEach((regions, state) => map.set(state, uniqueSorted(regions)));
    return map;
  }, [regionOptions]);

  const stateOptions = useMemo(
    () => Array.from(regionsByState.keys()).sort((a, b) => STATE_NAMES[a].localeCompare(STATE_NAMES[b])),
    [regionsByState],
  );
  const activeState = selectedState !== ALL && regionsByState.has(selectedState) ? selectedState : ALL;
  const cityRegionOptions = useMemo(
    () => (activeState === ALL ? [] : regionsByState.get(activeState) ?? []),
    [activeState, regionsByState],
  );
  const activeRegions = useMemo(
    () => new Set(Array.from(selectedRegions).filter((region) => cityRegionOptions.includes(region))),
    [cityRegionOptions, selectedRegions],
  );
  const hasRegionFilter = activeRegions.size > 0;
  const geographyLabel = hasRegionFilter
    ? activeRegions.size === 1
      ? regionDisplayName(Array.from(activeRegions)[0])
      : `${activeRegions.size} ${STATE_NAMES[activeState]} regions`
    : activeState !== ALL
      ? `All ${STATE_NAMES[activeState]} regions`
      : 'All geographies';

  const stateRecords = useMemo(() => {
    if (!data || activeState === ALL) return yearRecords;
    return yearRecords.filter((record) => regionStates(data.dictionaries.regions[record[1]]).includes(activeState));
  }, [activeState, data, yearRecords]);

  const regionRecords = useMemo(() => {
    if (!data || !hasRegionFilter) return stateRecords;
    return stateRecords.filter((record) => activeRegions.has(data.dictionaries.regions[record[1]]));
  }, [activeRegions, data, hasRegionFilter, stateRecords]);

  const entityOptions = useMemo(() => {
    if (!data) return [];
    return uniqueSorted(data.dictionaries.entities.filter((entity) => !entityOnlyPeriods || entity !== ENTITY_NOT_REPORTED));
  }, [data, entityOnlyPeriods]);
  const activeEntity = selectedEntity !== ALL && entityOptions.includes(selectedEntity) ? selectedEntity : ALL;

  const entityRecords = useMemo(() => {
    if (!data || activeEntity === ALL) return regionRecords;
    return regionRecords.filter((record) => data.dictionaries.entities[record[2]] === activeEntity);
  }, [activeEntity, data, regionRecords]);

  const placeOptions = useMemo(() => {
    if (!data) return [];
    return uniqueSorted(data.dictionaries.places);
  }, [data]);
  const activePlace = selectedPlace !== ALL && placeOptions.includes(selectedPlace) ? selectedPlace : ALL;

  const exactRecords = useMemo(() => {
    if (!data || activePlace === ALL) return entityRecords;
    return entityRecords.filter((record) => data.dictionaries.places[record[5]] === activePlace);
  }, [activePlace, data, entityRecords]);

  const procedureRecords = useMemo(() => {
    if (!indexes || !selectedCodeInfo) return [];
    return (indexes.recordsByProcedure.get(selectedCodeInfo.procedureId) ?? []).filter((record) => {
      if (entityOnlyPeriods) return record[3] === 2025 && (record[4] === 3 || record[4] === 4);
      return selectedYears.has(record[3]);
    });
  }, [entityOnlyPeriods, indexes, selectedCodeInfo, selectedYears]);

  const stats = useMemo(() => summarize(exactRecords), [exactRecords]);
  const fallbackCodeStats = useMemo(() => summarize(yearRecords), [yearRecords]);

  const modelScopes = useMemo(() => {
    const scopes: { label: string; records: RecordTuple[] }[] = [];
    const exactLabels = [
      geographyLabel,
      activeEntity === ALL ? 'all entities' : activeEntity,
      activePlace === ALL ? 'all places' : `POS ${activePlace}`,
    ];
    scopes.push({ label: `exact filters (${exactLabels.join(', ')})`, records: exactRecords });
    if (activePlace !== ALL) scopes.push({ label: 'selected code, geography, and entity across places', records: entityRecords });
    if (activeEntity !== ALL) scopes.push({ label: 'selected code and geography across entities', records: regionRecords });
    if (hasRegionFilter) scopes.push({ label: 'selected code across regions in the selected state', records: stateRecords });
    if (activeState !== ALL) scopes.push({ label: 'selected code across all geographies', records: yearRecords });
    scopes.push({ label: 'same procedure family across selected years', records: procedureRecords });
    return scopes.filter((scope, index, array) => scope.records.length && array.findIndex((item) => item.records === scope.records) === index);
  }, [
    activeEntity,
    activePlace,
    activeState,
    entityRecords,
    exactRecords,
    geographyLabel,
    hasRegionFilter,
    procedureRecords,
    regionRecords,
    stateRecords,
    yearRecords,
  ]);

  const riskFloor = riskFloorPct / 100;
  const selectedCohortOffers = useMemo(
    () =>
      exactRecords
        .filter(
          (record) =>
            (record[10] === 0 || record[10] === 1) &&
            isFiniteNumber(record[7]) &&
            record[7] > 0,
        )
        .map((record) => record[7] as number),
    [exactRecords],
  );
  const model = useMemo(
    () => buildModel(modelScopes, riskFloor, selectedCohortOffers),
    [modelScopes, riskFloor, selectedCohortOffers],
  );
  const offerAxisLimit = model ? (showExtrapolation ? model.amountMax : model.defaultAmountMax) : 1;
  const offerAxisMax = model
    ? Math.max(model.amountMin + 1, Math.min(axisMaxOverride ?? offerAxisLimit, offerAxisLimit))
    : 1;
  const displayedOfferAmount = useMemo(() => {
    if (!model) return offerAmount;
    const fallback = model.recommended?.amount ?? model.aggressive?.amount ?? model.amountMin;
    const rawAmount = offerAmount ?? fallback;
    return Math.min(offerAxisMax, Math.max(model.amountMin, rawAmount));
  }, [model, offerAmount, offerAxisMax]);

  const selectedModelPoint = displayedOfferAmount && model ? interpolatePoint(model.points, displayedOfferAmount) : null;

  const yearSegments = useMemo(() => groupSegments(exactRecords, (record) => `${record[3]} Q${record[4]}`, 12), [exactRecords]);
  const entitySegments = useMemo(
    () =>
      groupSegments(
        hasRegionFilter ? regionRecords : stateRecords,
        (record) => data?.dictionaries.entities[record[2]] ?? 'N/R',
        10,
      ),
    [data, hasRegionFilter, regionRecords, stateRecords],
  );
  const geographySegments = useMemo(
    () =>
      groupSegments(
        activeEntity === ALL ? stateRecords : entityRecords,
        (record) => data?.dictionaries.regions[record[1]] ?? 'N/R',
        10,
      ),
    [activeEntity, data, entityRecords, stateRecords],
  );
  const placeSegments = useMemo(
    () => groupSegments(exactRecords, (record) => `POS ${data?.dictionaries.places[record[5]] ?? 'N/R'}`, 8),
    [data, exactRecords],
  );

  const comparableRows = useMemo(
    () =>
      exactRecords
        .slice()
        .sort((a, b) => b[3] - a[3] || b[4] - a[4])
        .slice(0, 50),
    [exactRecords],
  );

  const dataGenerated = data ? new Date(data.generatedAt).toLocaleString() : '';
  const entityCoverageRows = exactRecords.filter((record) => data?.dictionaries.entities[record[2]] !== 'Not reported in selected source').length;
  const entityCoverage = exactRecords.length ? entityCoverageRows / exactRecords.length : null;
  const sourceRows = data?.sources.reduce((sum, source) => sum + source.matchedRows, 0) ?? 0;

  function toggleYear(year: number) {
    setSelectedYears((current) => {
      const next = new Set(current);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      if (!next.size) return current;
      return next;
    });
  }

  function changeAxisMax(amount: number) {
    if (!model) return;
    const limit = showExtrapolation ? model.amountMax : model.defaultAmountMax;
    const next = Math.max(model.amountMin + 1, Math.min(limit, amount));
    setAxisMaxOverride(next);
    setOfferAmount((current) => (current === null ? current : Math.min(current, next)));
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8f4] p-6 text-slate-950">
        <div className="max-w-lg rounded-lg border border-red-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Dataset could not load</h1>
          <p className="mt-2 text-sm text-slate-600">{loadError}</p>
        </div>
      </main>
    );
  }

  if (!data || !indexes) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8f4] p-6 text-slate-950">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-teal-700">Loading local CMS IDR data</p>
          <p className="mt-2 text-2xl font-semibold">Preparing the arbitration console</p>
        </div>
      </main>
    );
  }

  const inputClass =
    'mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-100';

  const navItems: { id: ResultsPage; label: string; icon: typeof Calculator }[] = [
    { id: 'strategy', label: 'Strategy', icon: Calculator },
    { id: 'outcomes', label: 'Outcomes', icon: BarChart3 },
    { id: 'breakdowns', label: 'Breakdowns', icon: Database },
    { id: 'comparables', label: 'Comparable rows', icon: FileSearch },
    { id: 'guide', label: 'Guide', icon: BookOpen },
  ];

  if (!hasStarted) {
    return (
      <main className="flex min-h-screen flex-col bg-[#f4f6f5] text-slate-950">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-800 text-white">
                <Calculator size={19} aria-hidden="true" />
              </div>
              <div>
                <p className="font-semibold text-slate-950">Federal IDR Offer Console</p>
                <p className="text-xs text-slate-500">Out-of-network arbitration decision support</p>
              </div>
            </div>
            <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 sm:inline">
              CMS PUF 2023-2025
            </span>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-10 sm:px-8 sm:py-14">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-teal-700">New analysis</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl">Build an arbitration scenario</h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Choose the procedure, market, assigned IDR entity, care setting, and source period. The results separate offer strategy from the underlying outcome data.
            </p>
          </div>

          <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="grid gap-x-6 gap-y-6 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <label className="text-sm font-semibold text-slate-800" htmlFor="code">CPT or billing code</label>
                <input
                  id="code"
                  list="code-options"
                  value={codeInput}
                  onChange={(event) => setCodeInput(event.target.value)}
                  onBlur={() => setCodeInput(normalizeCode(codeInput))}
                  className={`${inputClass} text-base`}
                  placeholder="63047"
                />
                <datalist id="code-options">
                  {data.dictionaries.codes.map((code) => (
                    <option key={code.code} value={code.code}>{code.description}</option>
                  ))}
                </datalist>
                {selectedCodeInfo ? (
                  <p className="mt-2 text-sm leading-5 text-slate-600">
                    <span className="font-semibold text-slate-800">{selectedCodeInfo.procedureTitle || 'Procedure'}:</span>{' '}
                    {selectedCodeInfo.description}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-red-700">No local IDR records were found for this code.</p>
                )}
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-800" htmlFor="state">State</label>
                <select
                  id="state"
                  value={activeState}
                  onChange={(event) => {
                    setSelectedState(event.target.value);
                    setSelectedRegions(new Set());
                  }}
                  className={inputClass}
                >
                  <option value={ALL}>All states</option>
                  {stateOptions.map((state) => <option key={state} value={state}>{STATE_NAMES[state]}</option>)}
                </select>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800">City or market regions</p>
                <RegionCheckboxDropdown
                  stateName={activeState === ALL ? null : STATE_NAMES[activeState]}
                  options={cityRegionOptions}
                  selected={activeRegions}
                  onChange={setSelectedRegions}
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">Multi-state CMS regions appear under every state named in the region.</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-800" htmlFor="entity">Certified IDR entity</label>
                <select id="entity" value={activeEntity} onChange={(event) => setSelectedEntity(event.target.value)} className={inputClass}>
                  <option value={ALL}>All entities</option>
                  {entityOptions.map((entity) => <option key={entity} value={entity}>{entity}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-800" htmlFor="place">Place of service</label>
                <select id="place" value={activePlace} onChange={(event) => setSelectedPlace(event.target.value)} className={inputClass}>
                  <option value={ALL}>All places of service</option>
                  {placeOptions.map((place) => <option key={place} value={place}>POS {place}</option>)}
                </select>
              </div>

              <fieldset className="lg:col-span-2">
                <legend className="text-sm font-semibold text-slate-800">Data years</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DEFAULT_YEARS.map((year) => (
                    <label key={year} className={`flex h-10 min-w-24 items-center justify-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-4 text-sm font-medium ${entityOnlyPeriods ? 'opacity-45' : ''}`}>
                      <input type="checkbox" checked={selectedYears.has(year)} disabled={entityOnlyPeriods} onChange={() => toggleYear(year)} />
                      {year}
                    </label>
                  ))}
                </div>
                <label className="mt-3 flex max-w-3xl items-start gap-3 rounded-md border border-teal-200 bg-teal-50 px-3 py-3 text-sm leading-5 text-teal-950">
                  <input className="mt-1" type="checkbox" checked={entityOnlyPeriods} onChange={(event) => setEntityOnlyPeriods(event.target.checked)} />
                  <span><span className="font-semibold">Entity-labeled data only: 2025 Q3 and Q4.</span> The certified IDR entity field begins in 2025 Q3 in the local CMS files.</span>
                </label>
              </fieldset>
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5">
              <p className="max-w-2xl text-xs leading-5 text-slate-500">Decision support only. The model cannot observe the payer&apos;s final offer and does not replace legal, coding, or valuation advice.</p>
              <button
                type="button"
                disabled={!selectedCodeInfo}
                onClick={() => {
                  setOfferAmount(null);
                  setShowExtrapolation(false);
                  setAxisMaxOverride(null);
                  setActivePage('strategy');
                  setHasStarted(true);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-teal-800 px-5 text-sm font-semibold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Analyze scenario
                <Check size={17} aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>

        <footer className="px-5 pb-6 text-center text-xs text-slate-400">Made by Devin Kancherla</footer>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f6f5] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1480px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-800 text-white">
              <Calculator size={19} aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold">Federal IDR Offer Console</p>
              <p className="text-xs text-slate-500">CPT {normalizedCode} analysis</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setHasStarted(false)}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Edit inputs
          </button>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto grid w-full max-w-[1480px] gap-4 px-4 py-5 sm:px-7 lg:grid-cols-[0.9fr_1.2fr_1fr_0.7fr]">
          <div><p className="text-xs font-semibold uppercase text-slate-400">Procedure</p><p className="mt-1 text-sm font-semibold">{normalizedCode} - {selectedCodeInfo?.procedureTitle}</p></div>
          <div><p className="text-xs font-semibold uppercase text-slate-400">Geography</p><p className="mt-1 text-sm font-semibold">{geographyLabel}</p></div>
          <div><p className="text-xs font-semibold uppercase text-slate-400">IDR entity</p><p className="mt-1 text-sm font-semibold">{activeEntity === ALL ? 'All entities' : activeEntity}</p></div>
          <div><p className="text-xs font-semibold uppercase text-slate-400">Period / POS</p><p className="mt-1 text-sm font-semibold">{selectedPeriodLabel} / {activePlace === ALL ? 'All POS' : `POS ${activePlace}`}</p></div>
        </div>
      </section>

      <nav className="border-b border-slate-200 bg-white" aria-label="Analysis views">
        <div className="mx-auto flex w-full max-w-[1480px] gap-1 overflow-x-auto px-4 sm:px-7" role="tablist">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActivePage(item.id)}
                className={`flex h-13 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition ${active ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                <Icon size={16} aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-7 sm:py-8">
        <section className="block">
          <aside className="hidden">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4">
                <div>
                  <label className="text-sm font-semibold text-slate-800" htmlFor="code">
                    Billing code
                  </label>
                  <input
                    id="code"
                    list="code-options"
                    value={codeInput}
                    onChange={(event) => setCodeInput(event.target.value)}
                    onBlur={() => setCodeInput(normalizeCode(codeInput))}
                    className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                    placeholder="22551"
                  />
                  <datalist id="code-options">
                    {data.dictionaries.codes.map((code) => (
                      <option key={code.code} value={code.code}>
                        {code.procedureTitle ? `${code.procedureTitle} - ${code.description}` : code.description}
                      </option>
                    ))}
                  </datalist>
                  {selectedCodeInfo ? (
                    <p className="mt-2 text-sm leading-5 text-slate-600">
                      <span className="font-semibold text-slate-800">{selectedCodeInfo.procedureTitle || 'Unmapped code'}:</span>{' '}
                      {selectedCodeInfo.description}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-red-700">No local records found for this code.</p>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-800">Geography</p>
                  <p className="mt-2 text-sm text-slate-600">{geographyLabel}</p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-800" htmlFor="entity">
                    Certified IDR entity
                  </label>
                  <select
                    id="entity"
                    value={activeEntity}
                    onChange={(event) => setSelectedEntity(event.target.value)}
                    className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                  >
                    <option value={ALL}>All entities</option>
                    {entityOptions.map((entity) => (
                      <option key={entity} value={entity}>
                        {entity}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Entity is reported in this dataset beginning with 2025 Q3. Earlier rows remain available as pooled history.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-800" htmlFor="place">
                    Place of service
                  </label>
                  <select
                    id="place"
                    value={activePlace}
                    onChange={(event) => setSelectedPlace(event.target.value)}
                    className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                  >
                    <option value={ALL}>All places</option>
                    {placeOptions.map((place) => (
                      <option key={place} value={place}>
                        {place}
                      </option>
                    ))}
                  </select>
                </div>

                <fieldset>
                  <legend className="text-sm font-semibold text-slate-800">Data years</legend>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {DEFAULT_YEARS.map((year) => (
                      <label
                        key={year}
                        className={`flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-slate-50 text-sm font-medium ${entityOnlyPeriods ? 'opacity-45' : ''}`}
                      >
                        <input type="checkbox" checked={selectedYears.has(year)} disabled={entityOnlyPeriods} onChange={() => toggleYear(year)} />
                        {year}
                      </label>
                    ))}
                  </div>
                  <label className="mt-3 flex items-start gap-3 rounded-md border border-teal-200 bg-teal-50 px-3 py-3 text-sm leading-5 text-teal-950">
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={entityOnlyPeriods}
                      onChange={(event) => setEntityOnlyPeriods(event.target.checked)}
                    />
                    <span>
                      <span className="font-semibold">Entity-labeled only: 2025 Q3 and Q4.</span> Confirmed from the local CMS documentation: Certified IDR Entity appears beginning in 2025 Q3, so this is the cleanest filter for entity-specific analysis.
                    </span>
                  </label>
                </fieldset>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <label className="text-sm font-semibold text-slate-800" htmlFor="risk">
                Minimum win probability
              </label>
              <input
                id="risk"
                type="range"
                min="35"
                max="90"
                step="1"
                value={riskFloorPct}
                onChange={(event) => setRiskFloorPct(Number(event.target.value))}
                className="mt-3 w-full accent-teal-700"
              />
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="font-semibold">{riskFloorPct}%</span>
                <span className="text-slate-500">risk floor for the recommendation</span>
              </div>

              <label className="mt-5 block text-sm font-semibold text-slate-800" htmlFor="offer">
                Proposed provider offer
              </label>
              <input
                id="offer"
                type="range"
                min={model?.amountMin ?? 100}
                max={model?.amountMax ?? 100000}
                step={model && model.amountMax >= 100000 ? 1000 : 100}
                value={displayedOfferAmount ?? model?.recommended?.amount ?? model?.amountMin ?? 100}
                disabled={!model}
                onChange={(event) => setOfferAmount(Number(event.target.value))}
                className="mt-3 w-full accent-teal-700 disabled:opacity-50"
              />
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <span className="text-2xl font-semibold">{formatMoney(displayedOfferAmount ?? model?.recommended?.amount)}</span>
                <span className="text-right text-sm text-slate-500">
                  {selectedModelPoint ? `${formatPercent(selectedModelPoint.winProbability)} win chance` : 'insufficient model data'}
                </span>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 shadow-sm">
              <h2 className="text-base font-semibold">Source notes</h2>
              <p className="mt-2 text-slate-600">
                Matched {formatNumber(sourceRows)} local PUF rows. Generated {dataGenerated}.
              </p>
              <p className="mt-2 text-slate-600">
                CMS-suppressed dollar cells are counted in outcomes but excluded from amount, ratio, and model calculations.
              </p>
              <p className="mt-2 text-slate-600">
                Certified IDR Entity is available beginning in 2025 Q3 in the local CMS PUF documentation; earlier rows are pooled as not reported.
              </p>
            </section>
          </aside>

          <section className="min-w-0 space-y-6">
            <div className={activePage === 'strategy' ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-4' : 'hidden'}>
              <Metric
                label="Recommended offer"
                value={formatMoney(model?.recommended?.amount)}
                helper={model?.recommended ? `${formatPercent(model.recommended.winProbability)} estimated win chance` : `No supported offer clears the ${riskFloorPct}% floor`}
                tone="accent"
              />
              <Metric
                label="Expected payment"
                value={formatMoney(model?.recommended?.expectedPayment)}
                helper={model?.lossPayment ? `Loss-side proxy: ${formatMoney(model.lossPayment)}` : 'Uses median issuer offer as loss-side proxy'}
              />
              <Metric
                label="Exact cohort"
                value={formatNumber(stats.rows)}
                helper={`${formatPercent(stats.providerWinRate)} provider win rate; ${formatPercent(entityCoverage)} entity coverage`}
              />
              <Metric
                label="Median QPA"
                value={formatMoney(stats.qpaMedian ?? fallbackCodeStats.qpaMedian)}
                helper={`Median provider/QPA: ${formatRatio(stats.providerQpaMedian ?? fallbackCodeStats.providerQpaMedian)}`}
              />
            </div>

            <section className={activePage === 'strategy' ? 'min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm' : 'hidden'}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Historical case outcomes</h2>
                  <p className="mt-1 text-sm leading-5 text-slate-500">Every reported provider or plan win in the exact selected cohort, positioned by the actual provider offer.</p>
                </div>
                <p className="text-sm text-slate-500">Hover or tap a dot for case details</p>
              </div>
              <div className="mt-4">
                <OutcomeCasePlot records={exactRecords} data={data} />
              </div>
            </section>

            <section className={activePage === 'strategy' ? 'grid min-w-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]' : 'hidden'}>
              <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={17} className="text-teal-700" aria-hidden="true" />
                  <h2 className="font-semibold">Offer controls</h2>
                </div>
                <label className="mt-5 block text-sm font-semibold text-slate-800" htmlFor="result-risk">
                  Minimum win probability
                </label>
                <input
                  id="result-risk"
                  type="range"
                  min="35"
                  max="95"
                  step="1"
                  value={riskFloorPct}
                  onChange={(event) => setRiskFloorPct(Number(event.target.value))}
                  className="mt-3 w-full accent-teal-700"
                />
                <div className="mt-2 flex justify-between text-sm">
                  <span className="font-semibold">{riskFloorPct}%</span>
                  <span className="text-slate-500">recommendation floor</span>
                </div>

                <label className="mt-6 block text-sm font-semibold text-slate-800" htmlFor="result-offer">
                  Proposed provider offer
                </label>
                <input
                  id="result-offer"
                  type="range"
                  min={model?.amountMin ?? 0}
                  max={offerAxisMax}
                  step="any"
                  value={displayedOfferAmount ?? 0}
                  disabled={!model}
                  onChange={(event) => {
                    const next = roundOffer(Number(event.target.value));
                    setOfferAmount(model ? Math.min(offerAxisMax, Math.max(model.amountMin, next)) : next);
                  }}
                  className="mt-3 w-full accent-teal-700 disabled:opacity-50"
                />
                <p className="mt-3 text-2xl font-semibold">{formatMoney(displayedOfferAmount)}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedModelPoint ? `${formatPercent(selectedModelPoint.winProbability, 1)} estimated win chance` : 'Insufficient model data'}
                </p>
                {selectedModelPoint?.extrapolated ? (
                  <div className="mt-4 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                    <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    This amount is beyond the historical support boundary and is not eligible for recommendation.
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Offer curve</h2>
                    <p className="mt-1 text-sm leading-5 text-slate-500">Hover or tap for amount and win rate. Select the curve to move the slider.</p>
                  </div>
                  <div className="flex items-start gap-5">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={showExtrapolation}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setShowExtrapolation(checked);
                          setAxisMaxOverride(null);
                          if (!checked && model) {
                            setOfferAmount((current) =>
                              current === null ? current : Math.min(current, model.defaultAmountMax),
                            );
                          }
                        }}
                        className="h-4 w-4 accent-teal-700"
                      />
                      Show extrapolation
                    </label>
                    <div className="text-right text-sm leading-5 text-slate-500">
                      <p>Model rows: {formatNumber(model?.modelRows)}</p>
                      <p>Base win rate: {formatPercent(model?.baseWinRate)}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <OfferCurve
                    model={model}
                    riskFloor={riskFloor}
                    selectedPoint={selectedModelPoint}
                    onSelectAmount={setOfferAmount}
                    axisMax={offerAxisMax}
                    showExtrapolation={showExtrapolation}
                    onAxisMaxChange={changeAxisMax}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
                  <span><span className="mr-2 inline-block h-0.5 w-6 align-middle bg-teal-700" />Smoothed local historical win rate</span>
                  {showExtrapolation ? <span><span className="mr-2 inline-block w-6 border-t-2 border-dashed border-teal-700 align-middle" />Sensitivity tail to 0%</span> : null}
                  <span>Lowest exact-cohort offer: {formatMoney(model?.observedAmountMin)}</span>
                  <span>Default endpoint (99th percentile): {formatMoney(model?.defaultAmountMax)}</span>
                  <span>Highest observed offer: {formatMoney(model?.observedAmountMax)}</span>
                </div>
              </div>
            </section>

            <section className={activePage === 'strategy' ? 'grid gap-4 lg:grid-cols-3' : 'hidden'}>
              <div className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-3">
                <h2 className="text-lg font-semibold">Strategy points</h2>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {[
                    ['Conservative', model?.conservative],
                    ['Balanced', model?.recommended],
                    ['Aggressive', model?.aggressive],
                  ].map(([label, point]) => {
                    const modelPoint = point as ModelPoint | null | undefined;
                    return (
                      <div key={label as string} className="grid grid-cols-[1fr_auto] gap-x-3 border-l-2 border-slate-200 pl-4">
                        <span className="font-medium text-slate-700">{label as string}</span>
                        <span className="text-right font-semibold tabular-nums">{formatMoney(modelPoint?.amount)}</span>
                        <span className="text-slate-500">{formatPercent(modelPoint?.winProbability)} win chance</span>
                        <span className="text-right text-slate-500 tabular-nums">{formatMoney(modelPoint?.expectedPayment)} EV</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className={activePage === 'strategy' ? 'rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600' : 'hidden'}>
              <h2 className="font-semibold text-slate-950">Model scope</h2>
              <p className="mt-2">{model?.scope ?? 'No eligible model scope.'}{model?.includesDefaults ? ' Default decisions are included so the curve uses the same provider/plan outcome population as the historical case plot.' : ''}</p>
              <p className="mt-2">The solid curve starts at the lowest reported exact-cohort provider offer. At each amount it estimates the provider win fraction among historical rows with nearby provider offers, then applies modest shrinkage toward the model cohort&apos;s base win rate. The default view ends at the 99th percentile; expanding the chart keeps the curve solid through the highest observed offer, then shows a dashed sensitivity tail to zero. Recommendations stay within the default range and never use that tail.</p>
            </section>

            <section className={activePage === 'strategy' ? 'min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm' : 'hidden'}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Offer bucket comparison</h2>
                  <p className="mt-1 text-sm leading-5 text-slate-500">Six roughly equal-count groups ordered from the lowest to highest actual provider offers. Bars compare median offer size; the line compares observed provider win rate.</p>
                </div>
                <p className="text-sm text-slate-500">Hover, tap, or focus a bucket for details</p>
              </div>
              <div className="mt-4">
                <OfferBucketChart records={exactRecords} />
              </div>
            </section>

            <section className={activePage === 'guide' ? 'space-y-5' : 'hidden'}>
              <div>
                <h1 className="text-2xl font-semibold">Guide and methodology</h1>
                <p className="mt-2 text-sm text-slate-500">Definitions for the inputs, strategy points, and model boundaries.</p>
              </div>
              <div className="grid gap-8 rounded-lg border border-slate-200 bg-white p-6 lg:grid-cols-[0.8fr_1.2fr]">
                <div><h2 className="text-lg font-semibold">Place of service</h2><p className="mt-2 text-sm leading-6 text-slate-600">The two-digit CMS code for the care setting attached to the disputed line item.</p></div>
                <dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
                  <dt className="font-semibold">21</dt><dd>Inpatient hospital</dd>
                  <dt className="font-semibold">22</dt><dd>Outpatient hospital</dd>
                  <dt className="font-semibold">23</dt><dd>Emergency room - hospital</dd>
                  <dt className="font-semibold">24</dt><dd>Ambulatory surgical center</dd>
                  <dt className="font-semibold">N/R</dt><dd>Not reported in the source row</dd>
                </dl>
              </div>
              <div className="grid gap-8 rounded-lg border border-slate-200 bg-white p-6 lg:grid-cols-[0.8fr_1.2fr]">
                <div><h2 className="text-lg font-semibold">Strategy points</h2><p className="mt-2 text-sm leading-6 text-slate-600">All recommendations stay inside the historically supported portion of the curve.</p></div>
                <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm leading-6">
                  <dt className="font-semibold">Conservative</dt><dd>Highest expected payment clearing an 80% estimated win rate, or your higher selected floor.</dd>
                  <dt className="font-semibold">Balanced</dt><dd>Highest expected payment clearing the win-rate floor you set.</dd>
                  <dt className="font-semibold">Aggressive</dt><dd>Highest expected payment inside empirical support, without a minimum win-rate constraint.</dd>
                  <dt className="font-semibold">Slider</dt><dd>Your test offer. It may move into the extrapolated tail, where the estimate is clearly flagged.</dd>
                </dl>
              </div>
              <div className="grid gap-8 rounded-lg border border-slate-200 bg-white p-6 lg:grid-cols-[0.8fr_1.2fr]">
                <div><h2 className="text-lg font-semibold">How the curve works</h2><p className="mt-2 text-sm leading-6 text-slate-600">Raw outcomes and decision sensitivity are shown separately because historical offer size is confounded by case strength and selection.</p></div>
                <div className="space-y-3 text-sm leading-6 text-slate-600">
                  <p>The case plot is the observed evidence. For some codes, including 63047 in the pooled data, raw win rates are flat or higher at larger offers. That does not establish that asking more improves the same case; stronger cases may both ask more and win more often.</p>
                  <p>The offer curve estimates the local historical provider win rate with an adaptive nearest-neighbor smoother. For every proposed amount, it compares provider wins and plan wins among rows with nearby provider offers and modestly shrinks the result toward the model cohort&apos;s overall win rate. The hover panel reports the effective local sample size.</p>
                  <p>The supported curve is not forced downward. It may rise or fall where nearby historical outcomes do. This is an observational association, not proof that changing the offer alone causes the estimated change.</p>
                  <p>The solid linear axis starts at the lowest exact-cohort offer and normally ends at that cohort&apos;s 99th percentile. Show extrapolation expands the solid empirical curve through the highest observed offer, then adds a dashed sensitivity tail beyond the observed maximum that decays to 0%.</p>
                  <p>The offer bucket comparison sorts every exact-filter case with a reported provider offer and provider/plan outcome, then divides the ranked rows into six roughly equal-count groups. Bars show each group&apos;s median offer and the line shows its raw provider win rate. Equal dollar values may straddle adjacent groups when many cases report the same offer.</p>
                  <p>Expected payment equals win probability times the provider offer, plus loss probability times the median issuer offer. It is not profit and does not include costs, fees, delays, or collection risk.</p>
                </div>
              </div>
              <div className="grid gap-8 rounded-lg border border-slate-200 bg-white p-6 lg:grid-cols-[0.8fr_1.2fr]">
                <div><h2 className="text-lg font-semibold">Sources and limitations</h2><p className="mt-2 text-sm leading-6 text-slate-600">Descriptive decision support built from the local public-use files.</p></div>
                <div className="space-y-3 text-sm leading-6 text-slate-600">
                  <p>Matched {formatNumber(sourceRows)} local Federal IDR PUF rows across 2023-2025. Dataset generated {dataGenerated}.</p>
                  <p>CMS-suppressed dollar cells remain in outcome counts but are excluded from amount, ratio, and model calculations. Certified IDR Entity begins in 2025 Q3.</p>
                  <p>After choosing a state, the region menu can combine any number of checked markets. State filtering parses every abbreviation in each published geography, so cross-state markets are available from every included state.</p>
                </div>
              </div>
            </section>

            <section className={activePage === 'outcomes' ? 'grid gap-4 lg:grid-cols-2 2xl:grid-cols-4' : 'hidden'}>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-base font-semibold">Outcome mix</h3>
                <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-slate-500">Provider wins</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatNumber(stats.providerWins)}</dd>
                  <dt className="text-slate-500">Plan wins</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatNumber(stats.issuerWins)}</dd>
                  <dt className="text-slate-500">Split/other</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatNumber(stats.split + stats.other)}</dd>
                  <dt className="text-slate-500">Default decisions</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatNumber(stats.defaultWins)}</dd>
                </dl>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-base font-semibold">Provider offers</h3>
                <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-slate-500">25th percentile</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatMoney(stats.providerP25)}</dd>
                  <dt className="text-slate-500">Median</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatMoney(stats.providerMedian)}</dd>
                  <dt className="text-slate-500">75th percentile</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatMoney(stats.providerP75)}</dd>
                  <dt className="text-slate-500">Rows with offers</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatNumber(stats.amountRows)}</dd>
                </dl>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-base font-semibold">Plan and award</h3>
                <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-slate-500">Median plan offer</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatMoney(stats.issuerMedian)}</dd>
                  <dt className="text-slate-500">Median prevailing</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatMoney(stats.prevailingMedian)}</dd>
                  <dt className="text-slate-500">Plan/QPA</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatRatio(stats.issuerQpaMedian)}</dd>
                  <dt className="text-slate-500">Prevailing/QPA</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatRatio(stats.prevailingQpaMedian)}</dd>
                </dl>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-base font-semibold">Data quality</h3>
                <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-slate-500">Suppressed rows</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatNumber(stats.suppressedRows)}</dd>
                  <dt className="text-slate-500">QPA IQR</dt>
                  <dd className="text-right font-semibold tabular-nums">
                    {formatMoney(stats.qpaP25)} - {formatMoney(stats.qpaP75)}
                  </dd>
                  <dt className="text-slate-500">Selected years</dt>
                  <dd className="text-right font-semibold tabular-nums">{selectedPeriodLabel}</dd>
                  <dt className="text-slate-500">Rows in code</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatNumber(yearRecords.length)}</dd>
                </dl>
              </div>
            </section>

            <div className={activePage === 'breakdowns' ? 'grid gap-4 2xl:grid-cols-2' : 'hidden'}>
              <SegmentTable title="By year and quarter" rows={yearSegments} />
              <SegmentTable title="By certified IDR entity" rows={entitySegments} />
              <SegmentTable title="By geography" rows={geographySegments} />
              <SegmentTable title="By place of service" rows={placeSegments} />
            </div>

            <section className={activePage === 'comparables' ? 'rounded-lg border border-slate-200 bg-white p-4 shadow-sm' : 'hidden'}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Comparable rows</h2>
                <p className="text-sm text-slate-500">Showing newest 50 exact-filter rows</p>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-3 font-semibold">Period</th>
                      <th className="px-3 py-2 font-semibold">Region</th>
                      <th className="px-3 py-2 font-semibold">Entity</th>
                      <th className="px-3 py-2 text-right font-semibold">QPA</th>
                      <th className="px-3 py-2 text-right font-semibold">Provider</th>
                      <th className="px-3 py-2 text-right font-semibold">Plan</th>
                      <th className="px-3 py-2 text-right font-semibold">Prevailing</th>
                      <th className="px-3 py-2 font-semibold">Outcome</th>
                      <th className="py-2 pl-3 font-semibold">Default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparableRows.length ? (
                      comparableRows.map((record, index) => (
                        <tr key={`${record.join('-')}-${index}`} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-3 tabular-nums">{record[3]} Q{record[4]}</td>
                          <td className="max-w-[220px] px-3 py-2">{data.dictionaries.regions[record[1]]}</td>
                          <td className="max-w-[220px] px-3 py-2">{data.dictionaries.entities[record[2]]}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(record[6])}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(record[7])}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(record[8])}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(record[9])}</td>
                          <td className="px-3 py-2">{data.outcomes[record[10]]}</td>
                          <td className="py-2 pl-3">{data.defaultValues[record[11]]}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-4 text-slate-500" colSpan={9}>
                          No exact-filter rows. Broaden geography, entity, place, or year selection.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        </section>
      </div>
    </main>
  );
}
