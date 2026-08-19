import type {
  Offer,
  OfferAnalysis,
  Priority,
  Recommendation,
  ReviewSummary,
  TransportMode,
} from './types.js';

export const TRANSPORT_SCORING_VERSION = '2.0.0';

interface ScoringInput {
  transport: TransportMode;
  price: { amount: number };
  duration_min: number;
  departure_at: string;
  arrival_at: string;
  segments_count?: number;
  carriers?: string[];
  legs?: Array<{
    segments?: Array<{
      departure_at?: string;
      arrival_at?: string;
    }>;
  }>;
  review_summary?: ReviewSummary;
  fares?: {
    count?: number;
    refundable_count?: number;
    changeable_count?: number;
    refundable_unknown?: number;
    changeable_unknown?: number;
  };
  variants?: Array<{
    conditions?: {
      refundable?: boolean | null;
      changeable?: boolean | null;
    };
  }>;
  is_multi_pnr?: boolean;
}

type ScoreComponent = 'price' | 'time' | 'calm' | 'reliability' | 'flexibility';

const priorityWeights: Record<Priority, Record<ScoreComponent, number>> = {
  balance: { price: 0.27, time: 0.24, calm: 0.24, reliability: 0.13, flexibility: 0.12 },
  price: { price: 0.62, time: 0.12, calm: 0.1, reliability: 0.07, flexibility: 0.09 },
  time: { price: 0.1, time: 0.64, calm: 0.13, reliability: 0.08, flexibility: 0.05 },
  calm: { price: 0.1, time: 0.12, calm: 0.51, reliability: 0.15, flexibility: 0.12 },
};

const modeFriction: Record<TransportMode, number> = {
  railway: 1,
  etrain: 3,
  avia: 6,
  bus: 7,
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const finitePositive = (value: unknown): value is number =>
  Number.isFinite(value) && Number(value) > 0;

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function rankPercentile(value: number, values: number[], lowerIsBetter: boolean) {
  if (values.length <= 1 || values.every((item) => item === values[0])) return 100;
  const ordered = [...values].sort((left, right) => (lowerIsBetter ? left - right : right - left));
  const positions = ordered
    .map((item, index) => ({ item, index }))
    .filter((entry) => entry.item === value)
    .map((entry) => entry.index);
  const position = average(positions);
  return 100 - (position / (ordered.length - 1)) * 100;
}

/**
 * Совмещает относительный проигрыш лучшему варианту и устойчивое ранговое место.
 * Это не даёт одному выбросу искусственно «сплющить» всю остальную выдачу.
 */
function relativeUtility(
  value: number,
  values: number[],
  lowerIsBetter: boolean,
  sensitivity: number,
) {
  if (values.length <= 1 || values.every((item) => item === values[0])) return 100;
  const best = lowerIsBetter ? Math.min(...values) : Math.max(...values);
  const ratio = lowerIsBetter
    ? Math.max(1, value / Math.max(best, Number.EPSILON))
    : Math.max(1, best / Math.max(value, Number.EPSILON));
  const ratioScore = 100 * Math.exp(-sensitivity * Math.log(ratio));
  const percentileScore = rankPercentile(value, values, lowerIsBetter);
  return clamp(ratioScore * 0.62 + percentileScore * 0.38);
}

function normalizedRating(summary: ReviewSummary | undefined) {
  if (!finitePositive(summary?.rating)) return undefined;
  const scale = finitePositive(summary?.scale) ? summary.scale : 10;
  return clamp((summary.rating / scale) * 10, 0, 10);
}

function reliabilityScore(summary: ReviewSummary | undefined) {
  const rating = normalizedRating(summary);
  if (rating === undefined) return undefined;
  const reviewCount = Math.max(0, Number(summary?.review_count || 0));
  const effectiveCount = reviewCount > 0 ? reviewCount : 3;
  const priorRating = 8.2;
  const priorWeight = 30;
  const bayesianRating =
    (rating * effectiveCount + priorRating * priorWeight) / (effectiveCount + priorWeight);
  const quality = clamp((bayesianRating - 5) * 20);
  const evidence = clamp((Math.log10(reviewCount + 1) / 3.3) * 100);
  return clamp(quality * 0.82 + evidence * 0.18);
}

function dateHour(value: string | undefined) {
  const match = value?.match(/T(\d{2}):/);
  return match ? Number(match[1]) : undefined;
}

function isUncomfortableHour(value: string | undefined) {
  const hour = dateHour(value);
  return hour !== undefined && (hour >= 23 || hour < 6);
}

function endpointTimePenalty(value: string | undefined, arrival: boolean) {
  const hour = dateHour(value);
  if (hour === undefined) return 0;
  if (hour < 6) return arrival ? 18 : 16;
  if (hour === 6) return arrival ? 7 : 6;
  if (hour === 23) return arrival ? 11 : 12;
  if (hour === 22) return arrival ? 5 : 4;
  return 0;
}

function flattenedSegments(offer: ScoringInput) {
  return (offer.legs || []).flatMap((leg) => leg.segments || []);
}

function routeChanges(offer: ScoringInput) {
  const segments = flattenedSegments(offer).length || offer.segments_count || 1;
  return Math.max(0, segments - 1);
}

function transferPenalty(changes: number) {
  if (changes <= 0) return 0;
  if (changes === 1) return 24;
  if (changes === 2) return 41;
  return 41 + (changes - 2) * 12;
}

function connectionPenalty(offer: ScoringInput) {
  const segments = flattenedSegments(offer);
  let penalty = 0;
  for (let index = 1; index < segments.length; index += 1) {
    const previousArrival = Date.parse(segments[index - 1].arrival_at || '');
    const nextDeparture = Date.parse(segments[index].departure_at || '');
    if (!Number.isFinite(previousArrival) || !Number.isFinite(nextDeparture)) continue;
    const connectionMinutes = (nextDeparture - previousArrival) / 60_000;
    if (connectionMinutes < 35) penalty += 18;
    else if (connectionMinutes < 60) penalty += 9;
    else if (connectionMinutes > 360) penalty += 10;
    else if (connectionMinutes > 240) penalty += 5;
  }
  return penalty;
}

function flexibilityScore(offer: ScoringInput) {
  const refundable: boolean[] = [];
  const changeable: boolean[] = [];

  for (const variant of offer.variants || []) {
    if (typeof variant.conditions?.refundable === 'boolean')
      refundable.push(variant.conditions.refundable);
    if (typeof variant.conditions?.changeable === 'boolean')
      changeable.push(variant.conditions.changeable);
  }

  const fareCount = Math.max(0, Number(offer.fares?.count || 0));
  const knownRefundableFares = Math.max(
    0,
    fareCount - Number(offer.fares?.refundable_unknown || 0),
  );
  const knownChangeableFares = Math.max(
    0,
    fareCount - Number(offer.fares?.changeable_unknown || 0),
  );
  if (
    !refundable.length &&
    knownRefundableFares > 0 &&
    Number.isFinite(offer.fares?.refundable_count)
  ) {
    refundable.push(...Array(Math.min(knownRefundableFares, 100)).fill(false));
    const knownRefundable = Math.min(Number(offer.fares?.refundable_count || 0), refundable.length);
    for (let index = 0; index < knownRefundable; index += 1) refundable[index] = true;
  }
  if (
    !changeable.length &&
    knownChangeableFares > 0 &&
    Number.isFinite(offer.fares?.changeable_count)
  ) {
    changeable.push(...Array(Math.min(knownChangeableFares, 100)).fill(false));
    const knownChangeable = Math.min(Number(offer.fares?.changeable_count || 0), changeable.length);
    for (let index = 0; index < knownChangeable; index += 1) changeable[index] = true;
  }

  const parts: Array<{ value: number; weight: number }> = [];
  if (refundable.length)
    parts.push({
      value: (refundable.filter(Boolean).length / refundable.length) * 100,
      weight: 0.65,
    });
  if (changeable.length)
    parts.push({
      value: (changeable.filter(Boolean).length / changeable.length) * 100,
      weight: 0.35,
    });
  if (!parts.length) return undefined;
  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  return parts.reduce((sum, part) => sum + part.value * part.weight, 0) / weight;
}

function dataConfidence(offer: ScoringInput) {
  const checks: Array<[boolean, number]> = [
    [finitePositive(offer.price?.amount), 22],
    [finitePositive(offer.duration_min), 18],
    [Boolean(offer.departure_at), 12],
    [Boolean(offer.arrival_at), 12],
    [Boolean(flattenedSegments(offer).length || offer.segments_count), 12],
    [Boolean(offer.carriers?.length), 8],
    [normalizedRating(offer.review_summary) !== undefined, 8],
    [flexibilityScore(offer) !== undefined, 8],
  ];
  return checks.reduce((score, [known, weight]) => score + (known ? weight : 0), 0);
}

function weightedScore(components: Record<ScoreComponent, number | undefined>, priority: Priority) {
  const weights = priorityWeights[priority];
  const available = (Object.keys(weights) as ScoreComponent[]).filter((key) =>
    Number.isFinite(components[key]),
  );
  const totalWeight = available.reduce((sum, key) => sum + weights[key], 0);
  if (!totalWeight) return { score: 0, coverage: 0 };
  return {
    score:
      available.reduce((sum, key) => sum + Number(components[key]) * weights[key], 0) / totalWeight,
    coverage: totalWeight,
  };
}

function comparableMinimum(value: number, minimum: number) {
  return value <= minimum * 1.015;
}

function buildReasons(
  offer: ScoringInput,
  priority: Priority,
  context: { minPrice: number; minDuration: number },
  changes: number,
  overnight: boolean,
  reliability: number | undefined,
  flexibility: number | undefined,
) {
  const facts: Record<'price' | 'time' | 'calm' | 'quality' | 'flexibility', string[]> = {
    price: [],
    time: [],
    calm: [],
    quality: [],
    flexibility: [],
  };
  if (comparableMinimum(offer.price.amount, context.minPrice))
    facts.price.push('одна из самых низких цен');
  if (comparableMinimum(offer.duration_min, context.minDuration))
    facts.time.push('одно из минимальных времён в пути');
  facts.calm.push(
    changes === 0 ? 'без пересадок' : `${changes} ${changes === 1 ? 'пересадка' : 'пересадки'}`,
  );
  if (!overnight) facts.calm.push('удобное время отправления и прибытия');
  else facts.calm.push('затрагивает поздние или ранние часы');
  const rating = normalizedRating(offer.review_summary);
  if (reliability !== undefined && rating !== undefined) {
    facts.quality.push(`рейтинг ${rating.toFixed(1).replace('.0', '')}/10`);
  }
  if (flexibility !== undefined && flexibility >= 50) facts.flexibility.push('есть гибкие тарифы');
  if (offer.is_multi_pnr) facts.calm.push('оформляется отдельными билетами');

  const order: Record<Priority, Array<keyof typeof facts>> = {
    balance: ['calm', 'price', 'time', 'quality', 'flexibility'],
    price: ['price', 'calm', 'time', 'flexibility', 'quality'],
    time: ['time', 'calm', 'price', 'quality', 'flexibility'],
    calm: ['calm', 'quality', 'flexibility', 'time', 'price'],
  };
  return order[priority].flatMap((key) => facts[key]);
}

/**
 * Быстро и детерминированно оценивает транспортные варианты только по фактам
 * текущей выдачи. Неизвестные необязательные поля исключаются из формулы, а не
 * заменяются выдуманным средним значением.
 */
export function scoreOffers<T extends ScoringInput>(
  rawOffers: T[],
  priority: Priority,
): Array<T & { analysis: OfferAnalysis }> {
  if (!rawOffers.length) return [];

  const prices = rawOffers.map((offer) => offer.price?.amount).filter(finitePositive);
  const durations = rawOffers.map((offer) => offer.duration_min).filter(finitePositive);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const minDuration = durations.length ? Math.min(...durations) : 0;

  return rawOffers.map((offer) => {
    const changes = routeChanges(offer);
    const overnight =
      isUncomfortableHour(offer.departure_at) || isUncomfortableHour(offer.arrival_at);
    const priceScore = finitePositive(offer.price?.amount)
      ? relativeUtility(offer.price.amount, prices, true, 1.15)
      : undefined;
    const timeScore = finitePositive(offer.duration_min)
      ? relativeUtility(offer.duration_min, durations, true, 0.9)
      : undefined;
    const reliability = reliabilityScore(offer.review_summary);
    const flexibility = flexibilityScore(offer);
    const stressScore = Math.round(
      clamp(
        7 +
          modeFriction[offer.transport] +
          transferPenalty(changes) +
          connectionPenalty(offer) +
          endpointTimePenalty(offer.departure_at, false) +
          endpointTimePenalty(offer.arrival_at, true) +
          (timeScore === undefined ? 0 : (100 - timeScore) * 0.14) +
          (offer.is_multi_pnr ? 19 : 0) -
          (reliability === undefined ? 0 : Math.max(0, reliability - 65) * 0.06),
        3,
        98,
      ),
    );
    const calmScore = 100 - stressScore;
    const confidence = dataConfidence(offer);
    const weighted = weightedScore(
      {
        price: priceScore,
        time: timeScore,
        calm: calmScore,
        reliability,
        flexibility,
      },
      priority,
    );
    const severeRiskPenalty =
      priority === 'balance'
        ? Math.max(0, stressScore - 65) * 0.22
        : priority === 'calm'
          ? Math.max(0, stressScore - 65) * 0.08
          : 0;
    const routeScore = Math.round(
      clamp(
        weighted.score -
          (1 - weighted.coverage) * 8 -
          (100 - confidence) * 0.04 -
          severeRiskPenalty,
      ),
    );
    const reasons = buildReasons(
      offer,
      priority,
      { minPrice, minDuration },
      changes,
      overnight,
      reliability,
      flexibility,
    );

    return {
      ...offer,
      analysis: {
        stressScore,
        routeScore,
        changes,
        overnight,
        confidence,
        components: {
          price: priceScore === undefined ? null : Math.round(priceScore),
          time: timeScore === undefined ? null : Math.round(timeScore),
          calm: Math.round(calmScore),
          reliability: reliability === undefined ? null : Math.round(reliability),
          flexibility: flexibility === undefined ? null : Math.round(flexibility),
        },
        reasons,
      },
    };
  });
}

function recommendationFacts(offer: Offer, exclude?: RegExp) {
  const positiveFacts = offer.analysis.reasons
    .filter(
      (reason) => reason === 'без пересадок' || !/(пересадк|затрагивает|оформляется)/i.test(reason),
    )
    .filter((reason) => !exclude?.test(reason));
  const facts = (positiveFacts.length ? positiveFacts : offer.analysis.reasons)
    .slice(0, 2)
    .join(' · ');
  return facts ? `${facts}.` : '';
}

function recommendationMoney(amount: number, currency: string) {
  const symbol =
    currency === 'RUB' ? '₽' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
  return `${amount.toLocaleString('ru-RU')} ${symbol}`;
}

function recommendationDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return (
    [hours ? `${hours} ч` : '', remainder ? `${remainder} мин` : ''].filter(Boolean).join(' ') ||
    '0 мин'
  );
}

/**
 * Строит три продуктовых сценария из одной общей совокупности вариантов.
 * Баланс всегда пересчитывается именно с приоритетом balance и не зависит от
 * того, как пользователь сортировал выдачу перед этим.
 */
export function recommendOffers(offers: Offer[]): Recommendation[] {
  if (!offers.length) return [];
  const balanced = (scoreOffers(offers, 'balance') as Offer[]).sort(
    (left, right) =>
      right.analysis.routeScore - left.analysis.routeScore ||
      right.analysis.confidence - left.analysis.confidence ||
      left.price.amount - right.price.amount ||
      left.duration_min - right.duration_min,
  )[0];
  const cheap = (scoreOffers(offers, 'price') as Offer[]).sort(
    (left, right) =>
      left.price.amount - right.price.amount ||
      left.analysis.stressScore - right.analysis.stressScore ||
      left.duration_min - right.duration_min,
  )[0];
  const fast = (scoreOffers(offers, 'time') as Offer[]).sort(
    (left, right) =>
      left.duration_min - right.duration_min ||
      left.analysis.changes - right.analysis.changes ||
      left.price.amount - right.price.amount,
  )[0];

  return [
    {
      kind: 'balanced',
      title: 'Умный выбор',
      eyebrow: 'лучший баланс',
      caption:
        `${recommendationFacts(balanced)} Индекс баланса ${balanced.analysis.routeScore}/100.`.trim(),
      offerId: balanced.offer_id,
    },
    {
      kind: 'cheap',
      title: 'Сохранить бюджет',
      eyebrow: 'минимум затрат',
      caption:
        `Минимальная цена ${recommendationMoney(cheap.price.amount, cheap.price.currency)}. ${recommendationFacts(cheap, /низк.*цен/i)}`.trim(),
      offerId: cheap.offer_id,
    },
    {
      kind: 'fast',
      title: 'Успеть быстрее',
      eyebrow: 'минимум времени',
      caption:
        `Минимальное время в пути: ${recommendationDuration(fast.duration_min)}. ${recommendationFacts(fast, /минимальн.*врем/i)}`.trim(),
      offerId: fast.offer_id,
    },
  ];
}
