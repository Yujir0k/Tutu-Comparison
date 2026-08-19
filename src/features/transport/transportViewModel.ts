import { BusFront, Plane, TrainFront, TramFront } from 'lucide-react';
import type { Offer, Priority, TransportMode } from '../../types';

export const modeMeta: Record<
  TransportMode,
  { label: string; short: string; icon: typeof Plane; className: string }
> = {
  avia: { label: 'Самолёт', short: 'Авиа', icon: Plane, className: 'avia' },
  railway: { label: 'Поезд', short: 'Поезд', icon: TrainFront, className: 'rail' },
  bus: { label: 'Автобус', short: 'Автобус', icon: BusFront, className: 'bus' },
  etrain: { label: 'Электричка', short: 'Электричка', icon: TramFront, className: 'etrain' },
};

export const priorities: Array<{ id: Priority; label: string }> = [
  { id: 'balance', label: 'Баланс' },
  { id: 'price', label: 'Дешевле' },
  { id: 'time', label: 'Быстрее' },
  { id: 'calm', label: 'Спокойнее' },
];

export const categoryLabels: Record<string, string> = {
  SEDENTARY: 'Сидячий',
  RESERVED_SEAT: 'Плацкарт',
  COMPARTMENT: 'Купе',
  LUX: 'СВ',
  SOFT: 'Мягкий',
  SHARED: 'Общий',
};

export function formatMoney(amount: number, currency = 'RUB') {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount % 1 ? 2 : 0,
  }).format(amount);
}

export function formatTime(value?: string) {
  if (!value) return '—';
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1] || '—';
}

export function formatDate(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(
    new Date(value),
  );
}

export function formatTripDate(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  }).format(new Date(value));
}

export function placeParts(value?: string) {
  if (!value) return { city: 'Не указано', terminal: 'Точка отправления не указана' };
  const clean = value.replace(/\s*\(\d{5,}\)\s*$/, '');
  const [city, ...terminalParts] = clean.split(' — ');
  if (!terminalParts.length) return { city: '', terminal: clean };
  return {
    city: city || clean,
    terminal: terminalParts.join(' — ') || clean,
  };
}

export function baggageLabel(offer: Offer) {
  if (offer.transport !== 'avia') return null;
  const baggage = offer.variants?.[0]?.conditions?.baggage;
  if (!baggage) return null;
  if (!baggage.kg && !baggage.pieces) return 'Без багажа';
  if (baggage.kg)
    return `Багаж ${baggage.kg} кг${baggage.pieces ? ` · ${baggage.pieces} место` : ''}`;
  return `Багаж · ${baggage.pieces} место`;
}

export function cabinBaggageLabel(offer: Offer) {
  if (offer.transport !== 'avia') return null;
  const baggage = offer.variants?.[0]?.conditions?.cabin_baggage;
  if (!baggage) return null;
  const parts = [
    baggage.kg ? `${baggage.kg} кг` : null,
    baggage.pieces ? `${baggage.pieces} место` : null,
    baggage.dimensions || null,
  ].filter(Boolean);
  return parts.length ? `Ручная кладь · ${parts.join(' · ')}` : 'Ручная кладь включена';
}

export function baggageUpgradeLabel(offer: Offer) {
  if (offer.transport !== 'avia') return null;
  const upgrade = offer.variants?.find((variant) => {
    const baggage = variant.conditions?.baggage;
    return Boolean(
      variant.price &&
      (baggage?.kg || baggage?.pieces) &&
      variant.price.amount > offer.price.amount,
    );
  });
  const baggage = upgrade?.conditions?.baggage;
  if (!upgrade?.price || !baggage) return null;
  const size = baggage.kg ? `${baggage.kg} кг` : `${baggage.pieces} место`;
  return `Багаж ${size} от +${formatMoney(upgrade.price.amount - offer.price.amount, upgrade.price.currency)}`;
}

export function offerFallbackUrl(offer: Offer) {
  return offer.checkout_url || offer.search_results_url || null;
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours ? `${hours} ч` : ''}${rest ? ` ${rest} мин` : ''}`.trim();
}

export function pluralizeVariants(count: number) {
  const last = count % 10;
  const lastTwo = count % 100;
  if (last === 1 && lastTwo !== 11) return 'вариант';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'варианта';
  return 'вариантов';
}

export function pluralizeReviews(count: number) {
  const last = count % 10;
  const lastTwo = count % 100;
  if (last === 1 && lastTwo !== 11) return 'отзыв';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'отзыва';
  return 'отзывов';
}

export function pluralizeHotels(count: number) {
  const last = count % 10;
  const lastTwo = count % 100;
  if (last === 1 && lastTwo !== 11) return 'отель';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'отеля';
  return 'отелей';
}

export function firstSegment(offer: Offer) {
  return offer.legs?.[0]?.segments?.[0];
}

export function lastSegment(offer: Offer) {
  const leg = offer.legs?.[offer.legs.length - 1];
  return leg?.segments?.[leg.segments.length - 1];
}

export function refundValue(offer: Offer) {
  if (offer.transport === 'railway') {
    if (offer.fares?.refundable_count) return 'Есть возвратные тарифы';
    if (offer.fares?.refundable_unknown) return 'Не удалось проверить';
    return offer.fares?.refundable_count === 0 ? 'Подтверждённо возвратных нет' : 'Неизвестно';
  }
  if (offer.transport === 'avia') {
    const values = offer.variants?.map((variant) => variant.conditions?.refundable);
    if (values?.some(Boolean)) return 'Есть возвратный тариф';
    if (values?.some((value) => value === false)) return 'Есть подтверждённо невозвратный тариф';
  }
  return 'Туту не вернул это поле';
}

export function baggageValue(offer: Offer) {
  if (offer.transport !== 'avia') return 'Не применяется';
  const baggage = offer.variants?.[0]?.conditions?.baggage;
  if (!baggage) return 'Туту не вернул это поле';
  if (baggage.pieces === 0 || baggage.kg === 0) return 'Без багажа';
  const pieces = baggage.pieces ? `${baggage.pieces} место` : '';
  const kg = baggage.kg ? `${baggage.kg} кг` : '';
  return [pieces, kg].filter(Boolean).join(' · ') || 'Условия не указаны';
}

export function ratingValue(offer: Offer) {
  const rating = offer.review_summary?.rating;
  if (rating === undefined) return 'Нет данных';
  const count = offer.review_summary?.review_count;
  return `${rating}/10${count ? ` · ${count.toLocaleString('ru-RU')} отзывов` : ''}`;
}

export function seatCategories(offer: Offer) {
  const values = Object.keys(offer.fares?.seat_categories || {}).map(
    (value) => categoryLabels[value] || value,
  );
  if (values.length) return values.join(', ');
  return offer.transport === 'railway' ? 'Туту не вернул это поле' : 'Не применяется';
}

export function rankOffers(offers: Offer[], priority: Priority) {
  const sorted = [...offers];
  if (priority === 'price')
    sorted.sort(
      (a, b) =>
        a.price.amount - b.price.amount ||
        a.analysis.stressScore - b.analysis.stressScore ||
        a.duration_min - b.duration_min ||
        b.analysis.confidence - a.analysis.confidence,
    );
  if (priority === 'time')
    sorted.sort(
      (a, b) =>
        a.duration_min - b.duration_min ||
        a.analysis.changes - b.analysis.changes ||
        a.price.amount - b.price.amount ||
        b.analysis.confidence - a.analysis.confidence,
    );
  if (priority === 'calm')
    sorted.sort(
      (a, b) =>
        a.analysis.stressScore - b.analysis.stressScore ||
        a.analysis.changes - b.analysis.changes ||
        a.duration_min - b.duration_min ||
        a.price.amount - b.price.amount,
    );
  if (priority === 'balance')
    sorted.sort(
      (a, b) =>
        b.analysis.routeScore - a.analysis.routeScore ||
        b.analysis.confidence - a.analysis.confidence ||
        a.price.amount - b.price.amount ||
        a.duration_min - b.duration_min,
    );
  return sorted;
}

export function buildCuratorVerdict(leader: Offer, offers: Offer[], priority: Priority) {
  const ranked = rankOffers(offers, priority);
  const runner = ranked.find((offer) => offer.offer_id !== leader.offer_id);
  const cheapest = [...offers].sort((a, b) => a.price.amount - b.price.amount)[0];
  const fastest = [...offers].sort((a, b) => a.duration_min - b.duration_min)[0];
  const calmest = [...offers].sort((a, b) => a.analysis.stressScore - b.analysis.stressScore)[0];
  const strengths: string[] = [];
  let summary = 'Этот вариант лучше соответствует выбранному приоритету.';

  if (priority === 'balance') {
    summary = `Лучшее сочетание цены, времени и спокойствия из ${offers.length} вариантов.`;
    strengths.push(`Индекс баланса ${leader.analysis.routeScore}/100`);
  }
  if (priority === 'price') {
    summary = `Самая низкая цена в списке — ${formatMoney(leader.price.amount, leader.price.currency)}.`;
    if (runner && runner.price.amount > leader.price.amount) {
      strengths.push(
        `Экономия ${formatMoney(runner.price.amount - leader.price.amount, leader.price.currency)} к следующему по цене`,
      );
    }
  }
  if (priority === 'time') {
    summary = `Самый короткий путь — ${formatDuration(leader.duration_min)}.`;
    if (runner && runner.duration_min > leader.duration_min) {
      strengths.push(
        `Быстрее следующего варианта на ${formatDuration(runner.duration_min - leader.duration_min)}`,
      );
    }
  }
  if (priority === 'calm') {
    summary = `Минимальная нагрузка поездки — ${leader.analysis.stressScore}/100.`;
    if (runner && runner.analysis.stressScore > leader.analysis.stressScore) {
      strengths.push(
        `На ${runner.analysis.stressScore - leader.analysis.stressScore} пунктов спокойнее следующего варианта`,
      );
    }
  }

  if (leader.analysis.changes === 0) strengths.push('Без пересадок');
  else
    strengths.push(
      `${leader.analysis.changes} ${leader.analysis.changes === 1 ? 'пересадка' : 'пересадки'}`,
    );
  if (!leader.analysis.overnight) strengths.push('Не затрагивает поздние и ранние часы');
  if (leader.review_summary?.rating && leader.review_summary.rating >= 9) {
    strengths.push(`Рейтинг ${leader.review_summary.rating}/10`);
  }

  const priceGap = leader.price.amount - cheapest.price.amount;
  const timeGap = leader.duration_min - fastest.duration_min;
  const stressGap = leader.analysis.stressScore - calmest.analysis.stressScore;
  const tradeoffs: Array<{ dimension: 'price' | 'time' | 'calm'; severity: number; text: string }> =
    [];
  if (priceGap > Math.max(200, cheapest.price.amount * 0.04)) {
    tradeoffs.push({
      dimension: 'price',
      severity: priceGap / Math.max(1, cheapest.price.amount),
      text: `дороже самого дешёвого варианта на ${formatMoney(priceGap, leader.price.currency)} (${Math.round((priceGap / cheapest.price.amount) * 100)}%).`,
    });
  }
  if (timeGap >= 10) {
    tradeoffs.push({
      dimension: 'time',
      severity: timeGap / Math.max(1, fastest.duration_min),
      text: `дольше самого быстрого варианта на ${formatDuration(timeGap)}.`,
    });
  }
  if (stressGap >= 4) {
    tradeoffs.push({
      dimension: 'calm',
      severity: stressGap / 35,
      text: `нагрузка на ${stressGap} пунктов выше самого спокойного варианта.`,
    });
  }

  const relevantTradeoffs = tradeoffs.filter(
    (item) =>
      (priority === 'price' && item.dimension !== 'price') ||
      (priority === 'time' && item.dimension !== 'time') ||
      (priority === 'calm' && item.dimension !== 'calm') ||
      priority === 'balance',
  );
  const tradeoff =
    relevantTradeoffs.sort((left, right) => right.severity - left.severity)[0]?.text ||
    'существенного подтверждённого компромисса среди выбранных вариантов нет.';

  return { summary, strengths: strengths.slice(0, 3), tradeoff };
}
