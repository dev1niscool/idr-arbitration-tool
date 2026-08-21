'use client';

import { useEffect, useMemo, useState } from 'react';

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
};

type ModelResult = {
  points: ModelPoint[];
  recommended: ModelPoint | null;
  aggressive: ModelPoint | null;
  conservative: ModelPoint | null;
  selected: ModelPoint | null;
  modelRows: number;
  scope: string;
  usedDefaults: boolean;
  medianQpa: number | null;
  lossPayment: number | null;
  baseWinRate: number | null;
  amountMin: number;
  amountMax: number;
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

const ALL = '__all__';
const DEFAULT_CODE = '22551';
const DEFAULT_YEARS = [2023, 2024, 2025];
const ENTITY_ONLY_PERIOD_LABEL = '2025 Q3-Q4';
const ENTITY_NOT_REPORTED = 'Not reported in selected source';
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
  const step = value >= 100000 ? 1000 : value >= 10000 ? 500 : 100;
  return Math.round(value / step) * step;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
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

function contestedModelRows(records: RecordTuple[], allowDefaults: boolean) {
  return records.filter((record) => {
    if (!allowDefaults && record[11] !== 0) return false;
    return (
      (record[10] === 0 || record[10] === 1) &&
      isFiniteNumber(record[6]) &&
      record[6] > 0 &&
      isFiniteNumber(record[7]) &&
      record[7] > 0 &&
      isFiniteNumber(record[8]) &&
      record[8] > 0
    );
  });
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
      };
    }
  }
  return { ...last, amount };
}

function chooseBest(points: ModelPoint[], minWinProbability: number) {
  const eligible = points.filter((point) => point.winProbability >= minWinProbability);
  const pool = eligible.length ? eligible : points;
  return pool.reduce<ModelPoint | null>((best, point) => {
    if (!best || point.expectedPayment > best.expectedPayment) return point;
    return best;
  }, null);
}

function buildModel(
  scopes: { label: string; records: RecordTuple[] }[],
  riskFloor: number,
  selectedAmount: number | null,
): ModelResult | null {
  let chosen:
    | {
        label: string;
        rows: RecordTuple[];
        usedDefaults: boolean;
      }
    | null = null;

  for (const scope of scopes) {
    const nonDefault = contestedModelRows(scope.records, false);
    if (nonDefault.length >= 25) {
      chosen = { label: scope.label, rows: nonDefault, usedDefaults: false };
      break;
    }
    const withDefaults = contestedModelRows(scope.records, true);
    if (withDefaults.length >= 25) {
      chosen = { label: scope.label, rows: withDefaults, usedDefaults: true };
      break;
    }
    if (!chosen || withDefaults.length > chosen.rows.length) {
      chosen = { label: scope.label, rows: withDefaults, usedDefaults: true };
    }
  }

  if (!chosen || chosen.rows.length < 8) return null;

  const qpas = chosen.rows.map((record) => record[6]).filter(isFiniteNumber).filter((value) => value > 0);
  const issuerOffers = chosen.rows.map((record) => record[8]).filter(isFiniteNumber).filter((value) => value > 0);
  const ratios = chosen.rows
    .map((record) => (isFiniteNumber(record[6]) && record[6] > 0 && isFiniteNumber(record[7]) ? record[7] / record[6] : null))
    .filter(isFiniteNumber)
    .filter((value) => value > 0);
  const medianQpa = median(qpas);
  const lossPayment = median(issuerOffers);
  if (!medianQpa || !lossPayment || !ratios.length) return null;

  const wins = chosen.rows.filter((record) => record[10] === 0).length;
  const losses = chosen.rows.filter((record) => record[10] === 1).length;
  const baseWinRate = wins + losses ? wins / (wins + losses) : null;
  const ratioLow = Math.max(0.15, (quantile(ratios, 0.03) ?? 0.5) * 0.7);
  const ratioHigh = Math.min(800, Math.max((quantile(ratios, 0.98) ?? ratioLow * 3) * 1.35, ratioLow * 4));
  const amountMin = Math.max(100, roundOffer(ratioLow * medianQpa));
  const amountMax = Math.max(amountMin + 100, roundOffer(ratioHigh * medianQpa));
  const bandwidth = chosen.rows.length >= 250 ? 0.45 : 0.58;
  const priorStrength = chosen.rows.length >= 100 ? 8 : 14;
  const prior = baseWinRate ?? 0.5;

  const candidateAmounts = new Set<number>();
  for (let index = 0; index < 90; index += 1) {
    const t = index / 89;
    const ratio = Math.exp(Math.log(ratioLow) + (Math.log(ratioHigh) - Math.log(ratioLow)) * t);
    candidateAmounts.add(roundOffer(ratio * medianQpa));
  }
  for (const percentile of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const offer = quantile(chosen.rows.map((record) => record[7]).filter(isFiniteNumber), percentile);
    if (offer) candidateAmounts.add(roundOffer(offer));
  }
  if (selectedAmount) candidateAmounts.add(roundOffer(selectedAmount));

  const rawPoints = Array.from(candidateAmounts)
    .filter((amount) => amount > 0)
    .sort((a, b) => a - b)
    .map((amount) => {
      const offerRatio = amount / medianQpa;
      const logOfferRatio = Math.log(offerRatio);
      let weightSum = 0;
      let weightSquaredSum = 0;
      let weightedWins = 0;

      for (const record of chosen.rows) {
        const qpa = record[6];
        const provider = record[7];
        if (!isFiniteNumber(qpa) || qpa <= 0 || !isFiniteNumber(provider) || provider <= 0) continue;
        const recordRatio = provider / qpa;
        if (!Number.isFinite(recordRatio) || recordRatio <= 0) continue;
        const distance = Math.log(recordRatio) - logOfferRatio;
        const weight = Math.exp(-(distance * distance) / (2 * bandwidth * bandwidth));
        weightSum += weight;
        weightSquaredSum += weight * weight;
        weightedWins += weight * (record[10] === 0 ? 1 : 0);
      }

      const smoothed = (weightedWins + prior * priorStrength) / (weightSum + priorStrength);
      const winProbability = Math.min(0.98, Math.max(0.02, smoothed));
      const expectedPayment = winProbability * amount + (1 - winProbability) * lossPayment;
      const effectiveN = weightSquaredSum > 0 ? (weightSum * weightSum) / weightSquaredSum : 0;
      return { amount, winProbability, expectedPayment, effectiveN };
    });

  let monotone = 0.99;
  const points = rawPoints.map((point) => {
    monotone = Math.min(monotone, point.winProbability);
    const winProbability = monotone;
    return {
      ...point,
      winProbability,
      expectedPayment: winProbability * point.amount + (1 - winProbability) * lossPayment,
    };
  });

  const recommended = chooseBest(points, riskFloor);
  const aggressive = chooseBest(points, 0.02);
  const conservative = chooseBest(points, Math.max(riskFloor, 0.8));
  const selected = selectedAmount ? interpolatePoint(points, selectedAmount) : recommended;

  return {
    points,
    recommended,
    aggressive,
    conservative,
    selected,
    modelRows: chosen.rows.length,
    scope: chosen.label,
    usedDefaults: chosen.usedDefaults,
    medianQpa,
    lossPayment,
    baseWinRate,
    amountMin,
    amountMax,
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

function InfoTabs({
  activeTab,
  onChange,
}: {
  activeTab: 'place' | 'strategy';
  onChange: (tab: 'place' | 'strategy') => void;
}) {
  const tabClass = (tab: 'place' | 'strategy') =>
    `h-10 rounded-md px-4 text-sm font-semibold ${
      activeTab === tab
        ? 'bg-teal-700 text-white'
        : 'border border-slate-300 bg-white text-slate-700 hover:border-teal-500'
    }`;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Reference tabs">
        <button className={tabClass('place')} type="button" role="tab" aria-selected={activeTab === 'place'} onClick={() => onChange('place')}>
          Place of service
        </button>
        <button className={tabClass('strategy')} type="button" role="tab" aria-selected={activeTab === 'strategy'} onClick={() => onChange('strategy')}>
          Strategy points
        </button>
      </div>

      {activeTab === 'place' ? (
        <div className="mt-4 grid gap-4 text-sm leading-6 text-slate-600 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h3 className="text-base font-semibold text-slate-950">What Place of Service Means</h3>
            <p className="mt-2">
              Place of service is the two-digit CMS code for the care setting attached to the disputed line item. In this data it helps separate inpatient hospital, outpatient hospital, emergency department, ambulatory surgery center, and unreported settings.
            </p>
          </div>
          <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2">
            <dt className="font-semibold text-slate-800">21</dt>
            <dd>Inpatient hospital</dd>
            <dt className="font-semibold text-slate-800">22</dt>
            <dd>Outpatient hospital</dd>
            <dt className="font-semibold text-slate-800">23</dt>
            <dd>Emergency room - hospital</dd>
            <dt className="font-semibold text-slate-800">24</dt>
            <dd>Ambulatory surgical center</dd>
            <dt className="font-semibold text-slate-800">N/R</dt>
            <dd>Not reported in the source row</dd>
          </dl>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 text-sm leading-6 text-slate-600 lg:grid-cols-2">
          <div>
            <h3 className="text-base font-semibold text-slate-950">What Strategy Points Represent</h3>
            <p className="mt-2">
              The model estimates win probability from comparable historical provider-offer-to-QPA ratios. Expected value is estimated as provider offer times win probability, plus the median issuer offer times loss probability.
            </p>
          </div>
          <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2">
            <dt className="font-semibold text-slate-800">Conservative</dt>
            <dd>Highest expected payment that clears at least an 80% estimated win chance, or your selected floor if it is higher.</dd>
            <dt className="font-semibold text-slate-800">Balanced</dt>
            <dd>The main recommended offer: highest expected payment that clears the win-probability floor you set.</dd>
            <dt className="font-semibold text-slate-800">Aggressive</dt>
            <dd>Highest expected payment with minimal risk constraint. It can be more profitable on paper but usually has a lower estimated win chance.</dd>
            <dt className="font-semibold text-slate-800">Slider</dt>
            <dd>Your current proposed offer amount and the model&apos;s interpolated probability/expected value for that amount.</dd>
          </dl>
        </div>
      )}
    </section>
  );
}

function OfferCurve({ model, riskFloor }: { model: ModelResult | null; riskFloor: number }) {
  if (!model || !model.points.length) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500">
        Not enough numeric contested rows for an offer curve.
      </div>
    );
  }

  const width = 720;
  const height = 280;
  const padLeft = 58;
  const padRight = 22;
  const padTop = 18;
  const padBottom = 42;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;
  const minAmount = model.points[0].amount;
  const maxAmount = model.points[model.points.length - 1].amount;
  const xFor = (amount: number) => padLeft + ((amount - minAmount) / Math.max(1, maxAmount - minAmount)) * chartWidth;
  const yFor = (probability: number) => padTop + (1 - probability) * chartHeight;
  const line = model.points.map((point) => `${xFor(point.amount)},${yFor(point.winProbability)}`).join(' ');
  const selected = model.selected;
  const riskY = yFor(riskFloor);

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <svg className="min-w-[720px]" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Estimated provider win probability by proposed offer amount">
        <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line x1={padLeft} x2={width - padRight} y1={yFor(tick)} y2={yFor(tick)} stroke="#e2e8f0" />
            <text x={padLeft - 12} y={yFor(tick) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
              {formatPercent(tick)}
            </text>
          </g>
        ))}
        <line x1={padLeft} x2={width - padRight} y1={riskY} y2={riskY} stroke="#d97706" strokeDasharray="5 5" />
        <polyline points={line} fill="none" stroke="#0f766e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {selected ? (
          <g>
            <line x1={xFor(selected.amount)} x2={xFor(selected.amount)} y1={padTop} y2={height - padBottom} stroke="#64748b" strokeDasharray="4 4" />
            <circle cx={xFor(selected.amount)} cy={yFor(selected.winProbability)} r="6" fill="#0f766e" stroke="#ffffff" strokeWidth="2" />
          </g>
        ) : null}
        <text x={padLeft} y={height - 14} className="fill-slate-500 text-[11px]">
          {formatMoney(minAmount)}
        </text>
        <text x={width - padRight} y={height - 14} textAnchor="end" className="fill-slate-500 text-[11px]">
          {formatMoney(maxAmount)}
        </text>
        <text x={width / 2} y={height - 14} textAnchor="middle" className="fill-slate-600 text-[12px] font-semibold">
          Proposed provider offer
        </text>
      </svg>
    </div>
  );
}

export default function IdrConsole() {
  const [data, setData] = useState<IdrData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState(DEFAULT_CODE);
  const [selectedRegion, setSelectedRegion] = useState(ALL);
  const [selectedEntity, setSelectedEntity] = useState(ALL);
  const [selectedPlace, setSelectedPlace] = useState(ALL);
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set(DEFAULT_YEARS));
  const [entityOnlyPeriods, setEntityOnlyPeriods] = useState(false);
  const [riskFloorPct, setRiskFloorPct] = useState(70);
  const [offerAmount, setOfferAmount] = useState<number | null>(null);
  const [infoTab, setInfoTab] = useState<'place' | 'strategy'>('place');

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
    return uniqueSorted(data.dictionaries.regions);
  }, [data]);
  const activeRegion = selectedRegion !== ALL && regionOptions.includes(selectedRegion) ? selectedRegion : ALL;

  const regionRecords = useMemo(() => {
    if (!data || activeRegion === ALL) return yearRecords;
    return yearRecords.filter((record) => data.dictionaries.regions[record[1]] === activeRegion);
  }, [activeRegion, data, yearRecords]);

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
      activeRegion === ALL ? 'all geographies' : activeRegion,
      activeEntity === ALL ? 'all entities' : activeEntity,
      activePlace === ALL ? 'all places' : `POS ${activePlace}`,
    ];
    scopes.push({ label: `exact filters (${exactLabels.join(', ')})`, records: exactRecords });
    if (activePlace !== ALL) scopes.push({ label: 'selected code, geography, and entity across places', records: entityRecords });
    if (activeEntity !== ALL) scopes.push({ label: 'selected code and geography across entities', records: regionRecords });
    if (activeRegion !== ALL) scopes.push({ label: 'selected code across geographies', records: yearRecords });
    scopes.push({ label: 'same procedure family across selected years', records: procedureRecords });
    return scopes.filter((scope, index, array) => scope.records.length && array.findIndex((item) => item.records === scope.records) === index);
  }, [
    activeEntity,
    activePlace,
    activeRegion,
    entityRecords,
    exactRecords,
    procedureRecords,
    regionRecords,
    yearRecords,
  ]);

  const riskFloor = riskFloorPct / 100;
  const model = useMemo(() => buildModel(modelScopes, riskFloor, null), [modelScopes, riskFloor]);
  const displayedOfferAmount = useMemo(() => {
    if (!model) return offerAmount;
    const fallback = model.recommended?.amount ?? model.amountMin;
    const rawAmount = offerAmount ?? fallback;
    return Math.min(model.amountMax, Math.max(model.amountMin, rawAmount));
  }, [model, offerAmount]);

  const selectedModelPoint = displayedOfferAmount && model ? interpolatePoint(model.points, displayedOfferAmount) : model?.selected ?? null;

  const yearSegments = useMemo(() => groupSegments(exactRecords, (record) => `${record[3]} Q${record[4]}`, 12), [exactRecords]);
  const entitySegments = useMemo(
    () =>
      groupSegments(
        activeRegion === ALL ? yearRecords : regionRecords,
        (record) => data?.dictionaries.entities[record[2]] ?? 'N/R',
        10,
      ),
    [activeRegion, data, regionRecords, yearRecords],
  );
  const geographySegments = useMemo(
    () =>
      groupSegments(
        activeEntity === ALL ? yearRecords : entityRecords,
        (record) => data?.dictionaries.regions[record[1]] ?? 'N/R',
        10,
      ),
    [activeEntity, data, entityRecords, yearRecords],
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

  return (
    <main className="min-h-screen bg-[#f7f8f4] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Federal IDR offer console</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Out-of-network arbitration strategy</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              Built from the local CMS Federal IDR public use files for 2023, 2024, and 2025 plus the local billing-code mapping. The NYTimes article frames the incentive problem; this tool keeps the analysis empirical and source-limited.
            </p>
          </div>
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-950">
            Decision support only. It cannot know the payer&apos;s final submission or replace legal, coding, or valuation advice.
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="space-y-4">
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
                  <label className="text-sm font-semibold text-slate-800" htmlFor="region">
                    Geography
                  </label>
                  <select
                    id="region"
                    value={activeRegion}
                    onChange={(event) => setSelectedRegion(event.target.value)}
                    className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                  >
                    <option value={ALL}>All geographies</option>
                    {regionOptions.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
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

          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Recommended offer"
                value={formatMoney(model?.recommended?.amount)}
                helper={model?.recommended ? `${formatPercent(model.recommended.winProbability)} estimated win chance` : 'Not enough comparable numeric rows'}
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

            <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Offer curve</h2>
                    <p className="mt-1 text-sm leading-5 text-slate-500">
                      Model scope: {model?.scope ?? 'none'}{model?.usedDefaults ? '; defaults included due to sparse contested data' : ''}
                    </p>
                  </div>
                  <div className="text-right text-sm leading-5 text-slate-500">
                    <p>Model rows: {formatNumber(model?.modelRows)}</p>
                    <p>Base win rate: {formatPercent(model?.baseWinRate)}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <OfferCurve model={model} riskFloor={riskFloor} />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold">Strategy points</h2>
                <div className="mt-3 space-y-3 text-sm">
                  {[
                    ['Conservative', model?.conservative],
                    ['Balanced', model?.recommended],
                    ['Aggressive', model?.aggressive],
                    ['Slider', selectedModelPoint],
                  ].map(([label, point]) => {
                    const modelPoint = point as ModelPoint | null | undefined;
                    return (
                      <div key={label as string} className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
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

            <InfoTabs activeTab={infoTab} onChange={setInfoTab} />

            <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
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

            <div className="grid gap-4 2xl:grid-cols-2">
              <SegmentTable title="By year and quarter" rows={yearSegments} />
              <SegmentTable title="By certified IDR entity" rows={entitySegments} />
              <SegmentTable title="By geography" rows={geographySegments} />
              <SegmentTable title="By place of service" rows={placeSegments} />
            </div>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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
