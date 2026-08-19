import type { AgentStep, Offer, Priority, Recommendation } from '../src/types.js';
import { recommendOffers, scoreOffers } from '../src/scoring.js';

interface RawOffer extends Omit<Offer, 'analysis'> {
  [key: string]: unknown;
}

export function analyseOffers(
  rawOffers: RawOffer[],
  priority: Priority,
): { offers: Offer[]; agent: AgentStep } {
  const started = performance.now();
  const offers = scoreOffers(rawOffers, priority) as Offer[];

  offers.sort(
    (a, b) =>
      b.analysis.routeScore - a.analysis.routeScore ||
      b.analysis.confidence - a.analysis.confidence ||
      a.price.amount - b.price.amount ||
      a.duration_min - b.duration_min ||
      a.offer_id.localeCompare(b.offer_id),
  );
  return {
    offers,
    agent: {
      id: 'stress',
      name: 'Антистресс',
      role: 'оценивает нагрузку маршрута',
      detail: `Проверил ${offers.length} вариантов: цену, время, пересадки, неудобные часы, надёжность оценки и гибкость тарифов.`,
      durationMs: Math.round(performance.now() - started),
    },
  };
}

export function curateRecommendations(offers: Offer[]): {
  recommendations: Recommendation[];
  agent: AgentStep;
} {
  const started = performance.now();
  if (!offers.length) {
    return {
      recommendations: [],
      agent: {
        id: 'curator',
        name: 'Куратор',
        role: 'объясняет выбор',
        detail: 'Подходящих вариантов в текущей выдаче нет.',
        durationMs: Math.round(performance.now() - started),
      },
    };
  }

  const recommendations: Recommendation[] = recommendOffers(offers);

  return {
    recommendations,
    agent: {
      id: 'curator',
      name: 'Куратор',
      role: 'объясняет выбор',
      detail: `Собрал ${recommendations.length} сценария и сохранил ссылки на исходные предложения Туту.`,
      durationMs: Math.round(performance.now() - started),
    },
  };
}
