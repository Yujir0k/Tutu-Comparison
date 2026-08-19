import type { HotelOffer, ReviewSummary } from './types';

export const HOTEL_SCORING_VERSION = '2.0.0';

export type HotelPriority = 'balance' | 'price' | 'comfort' | 'location' | 'flexibility';

type HotelDimension = 'price' | 'quality' | 'location' | 'comfort' | 'flexibility';

export interface HotelScore {
  hotel: HotelOffer;
  total: number;
  confidence: number;
  components: Record<HotelDimension, number | null>;
  strengths: string[];
  tradeoff: string;
  summary: string;
}

const priorityWeights: Record<HotelPriority, Record<HotelDimension, number>> = {
  balance: { price: 0.27, quality: 0.25, location: 0.2, comfort: 0.14, flexibility: 0.14 },
  price: { price: 0.68, quality: 0.12, location: 0.07, comfort: 0.04, flexibility: 0.09 },
  comfort: { price: 0.08, quality: 0.39, location: 0.1, comfort: 0.3, flexibility: 0.13 },
  location: { price: 0.1, quality: 0.16, location: 0.52, comfort: 0.08, flexibility: 0.14 },
  flexibility: { price: 0.12, quality: 0.15, location: 0.1, comfort: 0.1, flexibility: 0.53 },
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function finite(value: unknown): value is number {
  return Number.isFinite(value);
}

function positive(value: unknown): value is number {
  return finite(value) && Number(value) > 0;
}

function finiteValues(values: Array<number | undefined>) {
  return values.filter(finite);
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function rankPercentile(value: number, values: number[], lowerIsBetter: boolean) {
  if (values.length <= 1 || values.every((item) => item === values[0])) return 100;
  const ordered = [...values].sort((left, right) => lowerIsBetter ? left - right : right - left);
  const positions = ordered
    .map((item, index) => ({ item, index }))
    .filter((entry) => entry.item === value)
    .map((entry) => entry.index);
  return 100 - (average(positions) / (ordered.length - 1)) * 100;
}

function relativeUtility(value: number | undefined, values: number[], lowerIsBetter: boolean, sensitivity: number) {
  if (!finite(value) || !values.length) return undefined;
  if (values.length === 1 || values.every((item) => item === values[0])) return 100;
  const best = lowerIsBetter ? Math.min(...values) : Math.max(...values);
  const ratio = lowerIsBetter
    ? Math.max(1, value / Math.max(best, Number.EPSILON))
    : Math.max(1, best / Math.max(value, Number.EPSILON));
  const ratioScore = 100 * Math.exp(-sensitivity * Math.log(ratio));
  return clamp(ratioScore * 0.62 + rankPercentile(value, values, lowerIsBetter) * 0.38);
}

function normalizedRating(summary: ReviewSummary | undefined, fallback: number | undefined) {
  const rating = finite(summary?.rating) ? summary.rating : fallback;
  if (!positive(rating)) return undefined;
  const scale = positive(summary?.scale) ? summary.scale : 10;
  return clamp((rating / scale) * 10, 0, 10);
}

function hotelRating(hotel: HotelOffer) {
  return normalizedRating(hotel.review_summary, hotel.rating);
}

function hotelReviewCount(hotel: HotelOffer) {
  const count = hotel.review_summary?.review_count ?? hotel.review_count;
  return finite(count) && count >= 0 ? count : undefined;
}

function bayesianQuality(hotel: HotelOffer) {
  const rating = hotelRating(hotel);
  if (rating === undefined) return undefined;
  const reviewCount = hotelReviewCount(hotel) || 0;
  const effectiveCount = reviewCount > 0 ? reviewCount : 3;
  const priorRating = 8.2;
  const priorWeight = 40;
  const adjustedRating = (rating * effectiveCount + priorRating * priorWeight) / (effectiveCount + priorWeight);
  const quality = clamp((adjustedRating - 5) * 20);
  const evidence = clamp(Math.log10(reviewCount + 1) / 3.7 * 100);
  return clamp(quality * 0.84 + evidence * 0.16);
}

/**
 * Возвращает расстояние до центра только из фактического структурированного
 * поля или однозначного текста адреса Tutu.
 */
export function hotelDistanceToCenter(hotel: HotelOffer) {
  if (finite(hotel.location?.distance_to_center_km)) return hotel.location.distance_to_center_km;
  const kilometers = hotel.address?.match(/(\d+(?:[.,]\d+)?)\s*км\s+от\s+центра/i);
  if (kilometers) return Number(kilometers[1].replace(',', '.'));
  const meters = hotel.address?.match(/(\d+(?:[.,]\d+)?)\s*м\s+от\s+центра/i);
  return meters ? Number(meters[1].replace(',', '.')) / 1000 : undefined;
}

export interface HotelMetroInfo {
  distanceMeters: number;
  name?: string;
}

/** Извлекает расстояние и название ближайшего метро без догадок. */
export function hotelMetroInfo(hotel: HotelOffer): HotelMetroInfo | undefined {
  const match = hotel.address?.match(/(\d+(?:[.,]\d+)?)\s*(км|м)\s+от\s+метро\s+(.+)$/i);
  if (!match) return undefined;
  const distance = Number(match[1].replace(',', '.'));
  return {
    distanceMeters: match[2].toLocaleLowerCase('ru-RU') === 'км' ? distance * 1000 : distance,
    name: match[3].trim() || undefined,
  };
}

/**
 * Показывает достаточность именно решающих данных. Фото, координаты и наличие
 * ссылки не повышают качество самого отеля и поэтому в показатель не входят.
 */
export function hotelDataCompleteness(hotel: HotelOffer) {
  const checks: Array<[boolean, number]> = [
    [positive(hotel.best_offer?.price?.amount), 22],
    [hotelRating(hotel) !== undefined, 16],
    [positive(hotelReviewCount(hotel)), 10],
    [hotelDistanceToCenter(hotel) !== undefined, 12],
    [hotelMetroInfo(hotel) !== undefined, 8],
    [positive(hotel.stars), 7],
    [typeof hotel.best_offer?.free_cancellation === 'boolean', 10],
    [typeof hotel.best_offer?.breakfast_included === 'boolean', 5],
    [positive(hotel.best_offer?.room_size_sqm), 5],
    [typeof hotel.best_offer?.pay_at_hotel === 'boolean' || typeof hotel.best_offer?.pay_online === 'boolean', 5],
  ];
  return checks.reduce((score, [known, weight]) => score + (known ? weight : 0), 0);
}

function thresholdScore(value: number, points: Array<[number, number]>) {
  if (value <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [limit, score] = points[index];
    const [previousLimit, previousScore] = points[index - 1];
    if (value <= limit) {
      const share = (value - previousLimit) / (limit - previousLimit);
      return previousScore + (score - previousScore) * share;
    }
  }
  return points.at(-1)?.[1] || 0;
}

function locationScore(hotel: HotelOffer, hotels: HotelOffer[]) {
  const center = hotelDistanceToCenter(hotel);
  const metro = hotelMetroInfo(hotel)?.distanceMeters;
  const parts: Array<{ value: number; weight: number }> = [];

  if (center !== undefined) {
    const absolute = thresholdScore(center, [[0, 100], [0.5, 98], [1, 94], [3, 76], [5, 58], [10, 25], [20, 0]]);
    const relative = relativeUtility(center, finiteValues(hotels.map(hotelDistanceToCenter)), true, 0.38) || 0;
    parts.push({ value: absolute * 0.74 + relative * 0.26, weight: 0.68 });
  }
  if (metro !== undefined) {
    const absolute = thresholdScore(metro, [[0, 100], [300, 98], [600, 84], [1000, 65], [2000, 35], [4000, 0]]);
    const relative = relativeUtility(metro, finiteValues(hotels.map((item) => hotelMetroInfo(item)?.distanceMeters)), true, 0.32) || 0;
    parts.push({ value: absolute * 0.78 + relative * 0.22, weight: 0.32 });
  }
  if (!parts.length) return undefined;
  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  return parts.reduce((sum, part) => sum + part.value * part.weight, 0) / weight;
}

function roomSizeScore(size: number | null | undefined) {
  if (!positive(size)) return undefined;
  return thresholdScore(size, [[8, 10], [12, 25], [16, 45], [20, 62], [25, 76], [35, 90], [50, 100]]);
}

function comfortScore(hotel: HotelOffer) {
  const parts: Array<{ value: number; weight: number }> = [];
  const quality = bayesianQuality(hotel);
  if (quality !== undefined) parts.push({ value: quality, weight: 0.42 });
  if (positive(hotel.stars)) parts.push({ value: clamp(hotel.stars / 5 * 100), weight: 0.25 });
  const room = roomSizeScore(hotel.best_offer?.room_size_sqm);
  if (room !== undefined) parts.push({ value: room, weight: 0.2 });
  if (typeof hotel.best_offer?.breakfast_included === 'boolean') {
    parts.push({ value: hotel.best_offer.breakfast_included ? 100 : 30, weight: 0.13 });
  }
  if (!parts.length) return undefined;
  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  return parts.reduce((sum, part) => sum + part.value * part.weight, 0) / weight;
}

function flexibilityScore(hotel: HotelOffer) {
  const parts: Array<{ value: number; weight: number }> = [];
  if (typeof hotel.best_offer?.free_cancellation === 'boolean') {
    parts.push({ value: hotel.best_offer.free_cancellation ? 100 : 0, weight: 0.72 });
  }
  if (typeof hotel.best_offer?.pay_at_hotel === 'boolean') {
    parts.push({ value: hotel.best_offer.pay_at_hotel ? 100 : 35, weight: 0.2 });
  }
  if (typeof hotel.best_offer?.pay_online === 'boolean') {
    parts.push({ value: hotel.best_offer.pay_online ? 65 : 35, weight: 0.08 });
  }
  if (!parts.length) return undefined;
  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  return parts.reduce((sum, part) => sum + part.value * part.weight, 0) / weight;
}

function hotelComponents(hotel: HotelOffer, hotels: HotelOffer[]) {
  const prices = finiteValues(hotels.map((item) => item.best_offer?.price?.amount));
  return {
    price: relativeUtility(hotel.best_offer?.price?.amount, prices, true, 1.1),
    quality: bayesianQuality(hotel),
    location: locationScore(hotel, hotels),
    comfort: comfortScore(hotel),
    flexibility: flexibilityScore(hotel),
  } satisfies Record<HotelDimension, number | undefined>;
}

function weightedScore(components: Record<HotelDimension, number | undefined>, priority: HotelPriority) {
  const weights = priorityWeights[priority];
  const available = (Object.keys(weights) as HotelDimension[]).filter((key) => finite(components[key]));
  const totalWeight = available.reduce((sum, key) => sum + weights[key], 0);
  if (!totalWeight) return { score: 0, coverage: 0 };
  return {
    score: available.reduce((sum, key) => sum + Number(components[key]) * weights[key], 0) / totalWeight,
    coverage: totalWeight,
  };
}

function buildStrengths(hotel: HotelOffer, hotels: HotelOffer[], priority: HotelPriority) {
  const facts: Record<HotelDimension, string[]> = {
    price: [],
    quality: [],
    location: [],
    comfort: [],
    flexibility: [],
  };
  const price = hotel.best_offer?.price?.amount;
  const prices = finiteValues(hotels.map((item) => item.best_offer?.price?.amount));
  if (finite(price) && prices.length && price <= Math.min(...prices) * 1.015) facts.price.push('Одна из самых низких цен');

  const quality = bayesianQuality(hotel);
  const qualities = finiteValues(hotels.map(bayesianQuality));
  const rating = hotelRating(hotel);
  const reviews = hotelReviewCount(hotel);
  if (quality !== undefined && qualities.length && quality >= Math.max(...qualities) - 0.5 && rating !== undefined) {
    facts.quality.push(`Самая надёжная высокая оценка: ${rating}/10`);
  } else if (rating !== undefined && rating >= 9 && (reviews || 0) >= 50) {
    facts.quality.push(`Высокая оценка ${rating}/10 по ${reviews} отзывам`);
  }

  const center = hotelDistanceToCenter(hotel);
  const centers = finiteValues(hotels.map(hotelDistanceToCenter));
  if (center !== undefined && centers.length && center <= Math.min(...centers) + 0.05) facts.location.push('Ближе всего к центру');
  const metro = hotelMetroInfo(hotel)?.distanceMeters;
  const metros = finiteValues(hotels.map((item) => hotelMetroInfo(item)?.distanceMeters));
  if (metro !== undefined && metros.length && metro <= Math.min(...metros) + 10) facts.location.push('Ближе всего к метро');

  const room = hotel.best_offer?.room_size_sqm;
  const rooms = finiteValues(hotels.map((item) => item.best_offer?.room_size_sqm ?? undefined));
  if (finite(room) && rooms.length && room >= Math.max(...rooms)) facts.comfort.push(`Самый просторный номер: ${room} м²`);
  if (hotel.best_offer?.breakfast_included) facts.comfort.push('Завтрак включён');
  if (hotel.best_offer?.free_cancellation) facts.flexibility.push('Бесплатная отмена');
  if (hotel.best_offer?.pay_at_hotel) facts.flexibility.push('Оплата при заселении');

  const order: Record<HotelPriority, HotelDimension[]> = {
    balance: ['price', 'quality', 'location', 'flexibility', 'comfort'],
    price: ['price', 'quality', 'flexibility', 'location', 'comfort'],
    comfort: ['quality', 'comfort', 'flexibility', 'location', 'price'],
    location: ['location', 'quality', 'flexibility', 'price', 'comfort'],
    flexibility: ['flexibility', 'quality', 'price', 'location', 'comfort'],
  };
  return order[priority].flatMap((dimension) => facts[dimension]).slice(0, 3);
}

function buildTradeoff(hotel: HotelOffer, hotels: HotelOffer[]) {
  const candidates: Array<{ severity: number; text: string }> = [];
  const price = hotel.best_offer?.price?.amount;
  const prices = finiteValues(hotels.map((item) => item.best_offer?.price?.amount));
  const minimumPrice = prices.length ? Math.min(...prices) : undefined;
  if (finite(price) && finite(minimumPrice) && price > minimumPrice * 1.05) {
    const difference = price - minimumPrice;
    candidates.push({
      severity: Math.min(100, difference / minimumPrice * 180),
      text: `дороже самого доступного варианта на ${Math.round(difference).toLocaleString('ru-RU')} ₽ (${Math.round(difference / minimumPrice * 100)}%).`,
    });
  }

  const rating = hotelRating(hotel);
  const ratings = finiteValues(hotels.map(hotelRating));
  const bestRating = ratings.length ? Math.max(...ratings) : undefined;
  if (rating !== undefined && bestRating !== undefined && bestRating - rating >= 0.3) {
    candidates.push({
      severity: (bestRating - rating) * 20,
      text: `оценка гостей на ${Number((bestRating - rating).toFixed(1))} пункта ниже максимальной в сравнении.`,
    });
  }

  const distance = hotelDistanceToCenter(hotel);
  const distances = finiteValues(hotels.map(hotelDistanceToCenter));
  const nearest = distances.length ? Math.min(...distances) : undefined;
  if (distance !== undefined && nearest !== undefined && distance > nearest + 0.8) {
    candidates.push({
      severity: Math.min(70, (distance - nearest) * 9),
      text: `на ${Number((distance - nearest).toFixed(1))} км дальше от центра, чем ближайший вариант.`,
    });
  }

  if (hotel.best_offer?.free_cancellation === false && hotels.some((item) => item.best_offer?.free_cancellation === true)) {
    candidates.push({ severity: 32, text: 'бесплатная отмена не входит в текущее предложение.' });
  }
  if (hotel.best_offer?.breakfast_included === false && hotels.some((item) => item.best_offer?.breakfast_included === true)) {
    candidates.push({ severity: 14, text: 'завтрак не включён, хотя в сравнении есть варианты с завтраком.' });
  }

  return candidates.sort((left, right) => right.severity - left.severity)[0]?.text
    || 'существенного подтверждённого компромисса среди выбранных вариантов нет.';
}

function prioritySummary(priority: HotelPriority) {
  if (priority === 'price') return 'Минимальные затраты с проверкой качества, расположения и условий бронирования.';
  if (priority === 'comfort') return 'Рейтинг с поправкой на число отзывов, категория, номер и включённые удобства.';
  if (priority === 'location') return 'Расстояние до центра и метро с контролем качества, цены и гибкости.';
  if (priority === 'flexibility') return 'Условия отмены и оплаты без игнорирования цены и качества проживания.';
  return 'Взвешенный баланс цены, надёжности оценки, расположения, комфорта и условий.';
}

/**
 * Ранжирует короткий список без сетевых запросов и использует только
 * факты текущего ответа Tutu. Неизвестная метрика исключается из весов, после
 * чего применяется небольшой прозрачный штраф за недостаточность данных.
 */
export function rankHotels(hotels: HotelOffer[], priority: HotelPriority): HotelScore[] {
  const scored = hotels
    .map((hotel) => {
      const metrics = hotelComponents(hotel, hotels);
      const confidence = hotelDataCompleteness(hotel);
      const weighted = weightedScore(metrics, priority);
      const total = Math.round(clamp(
        weighted.score
          - (1 - weighted.coverage) * 28
          - (100 - confidence) * 0.04,
      ));
      return {
        hotel,
        total,
        confidence,
        components: {
          price: metrics.price === undefined ? null : Math.round(metrics.price),
          quality: metrics.quality === undefined ? null : Math.round(metrics.quality),
          location: metrics.location === undefined ? null : Math.round(metrics.location),
          comfort: metrics.comfort === undefined ? null : Math.round(metrics.comfort),
          flexibility: metrics.flexibility === undefined ? null : Math.round(metrics.flexibility),
        },
        strengths: buildStrengths(hotel, hotels, priority),
        tradeoff: buildTradeoff(hotel, hotels),
        summary: prioritySummary(priority),
      };
    });

  return scored.sort((left, right) => {
    if (priority === 'price') {
      const priceDifference = (left.hotel.best_offer?.price?.amount || Number.MAX_SAFE_INTEGER)
        - (right.hotel.best_offer?.price?.amount || Number.MAX_SAFE_INTEGER);
      if (priceDifference) return priceDifference;
    }
    if (priority === 'location') {
      const centerDifference = (hotelDistanceToCenter(left.hotel) ?? Number.MAX_SAFE_INTEGER)
        - (hotelDistanceToCenter(right.hotel) ?? Number.MAX_SAFE_INTEGER);
      if (centerDifference) return centerDifference;
      const metroDifference = (hotelMetroInfo(left.hotel)?.distanceMeters ?? Number.MAX_SAFE_INTEGER)
        - (hotelMetroInfo(right.hotel)?.distanceMeters ?? Number.MAX_SAFE_INTEGER);
      if (metroDifference) return metroDifference;
    }
    if (priority === 'flexibility') {
      const flexibilityDifference = (right.components.flexibility ?? -1) - (left.components.flexibility ?? -1);
      if (flexibilityDifference) return flexibilityDifference;
    }
    return (
      right.total - left.total
      || right.confidence - left.confidence
      || (left.hotel.best_offer?.price?.amount || Number.MAX_SAFE_INTEGER) - (right.hotel.best_offer?.price?.amount || Number.MAX_SAFE_INTEGER)
      || left.hotel.name.localeCompare(right.hotel.name, 'ru-RU')
    );
  });
}
