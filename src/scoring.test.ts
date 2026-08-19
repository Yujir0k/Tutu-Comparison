import assert from 'node:assert/strict';
import test from 'node:test';
import { rankHotels } from './hotelScoring';
import { recommendOffers, scoreOffers } from './scoring';
import type { HotelOffer, Offer, TransportMode } from './types';

interface TestTransportOffer {
  offer_id: string;
  transport: TransportMode;
  price: { amount: number };
  duration_min: number;
  departure_at: string;
  arrival_at: string;
  segments_count: number;
  carriers: string[];
  review_summary?: { rating?: number; review_count?: number; scale?: number };
  variants?: Array<{ conditions?: { refundable?: boolean | null; changeable?: boolean | null } }>;
  is_multi_pnr?: boolean;
}

function transportOffer(overrides: Partial<TestTransportOffer> = {}): TestTransportOffer {
  return {
    offer_id: 'offer',
    transport: 'railway',
    price: { amount: 5_000 },
    duration_min: 240,
    departure_at: '2026-08-26T09:00:00+03:00',
    arrival_at: '2026-08-26T13:00:00+03:00',
    segments_count: 1,
    carriers: ['Перевозчик'],
    ...overrides,
  };
}

function hotel(overrides: Partial<HotelOffer> & Pick<HotelOffer, 'name'>): HotelOffer {
  return {
    ...overrides,
    name: overrides.name,
  };
}

test('баланс не выбирает рискованный маршрут только из-за низкой цены', () => {
  const direct = transportOffer({
    offer_id: 'direct',
    price: { amount: 6_500 },
    review_summary: { rating: 9.1, review_count: 800 },
    variants: [{ conditions: { refundable: true, changeable: true } }],
  });
  const risky = transportOffer({
    offer_id: 'risky',
    transport: 'avia',
    price: { amount: 3_000 },
    duration_min: 210,
    departure_at: '2026-08-26T23:40:00+03:00',
    arrival_at: '2026-08-27T03:10:00+03:00',
    segments_count: 3,
    is_multi_pnr: true,
  });
  const scored = scoreOffers([direct, risky], 'balance');
  const directScore = scored.find((offer) => offer.offer_id === 'direct')?.analysis;
  const riskyScore = scored.find((offer) => offer.offer_id === 'risky')?.analysis;
  assert.ok(directScore && riskyScore);
  assert.ok(directScore.routeScore > riskyScore.routeScore);
  assert.ok(directScore.stressScore < riskyScore.stressScore);
});

test('пересадки, неудобные часы и multi-PNR последовательно увеличивают нагрузку', () => {
  const baseline = scoreOffers([transportOffer()], 'calm')[0].analysis.stressScore;
  const complicated = scoreOffers(
    [
      transportOffer({
        segments_count: 3,
        departure_at: '2026-08-26T23:30:00+03:00',
        arrival_at: '2026-08-27T05:20:00+03:00',
        is_multi_pnr: true,
      }),
    ],
    'calm',
  )[0].analysis.stressScore;
  assert.ok(complicated >= baseline + 50);
});

test('рейтинг с одним отзывом не надёжнее высокой оценки с большой выборкой', () => {
  const tinySample = transportOffer({
    offer_id: 'tiny',
    review_summary: { rating: 10, review_count: 1 },
  });
  const reliable = transportOffer({
    offer_id: 'reliable',
    review_summary: { rating: 9.3, review_count: 1_000 },
  });
  const scored = scoreOffers([tinySample, reliable], 'balance');
  const tinyReliability = scored.find((offer) => offer.offer_id === 'tiny')?.analysis.components
    .reliability;
  const reliableReliability = scored.find((offer) => offer.offer_id === 'reliable')?.analysis
    .components.reliability;
  assert.ok(tinyReliability !== null && reliableReliability !== null);
  assert.ok(Number(reliableReliability) > Number(tinyReliability));
});

test('неизвестные тарифные условия остаются неизвестными', () => {
  const [scored] = scoreOffers([transportOffer()], 'balance');
  assert.equal(scored.analysis.components.flexibility, null);
  assert.ok(scored.analysis.confidence < 100);
});

test('сценарий «лучший баланс» не зависит от предыдущей сортировки по цене', () => {
  const direct = transportOffer({
    offer_id: 'direct',
    price: { amount: 6_500 },
    review_summary: { rating: 9.2, review_count: 700 },
    variants: [{ conditions: { refundable: true, changeable: true } }],
  });
  const risky = transportOffer({
    offer_id: 'risky',
    transport: 'avia',
    price: { amount: 3_000 },
    duration_min: 210,
    departure_at: '2026-08-26T23:40:00+03:00',
    arrival_at: '2026-08-27T03:10:00+03:00',
    segments_count: 3,
    is_multi_pnr: true,
  });
  const priceScored = scoreOffers([direct, risky], 'price') as unknown as Offer[];
  const recommendations = recommendOffers(priceScored);
  const balanced = recommendations.find((item) => item.kind === 'balanced');
  assert.equal(balanced?.offerId, 'direct');
  assert.ok(!balanced?.caption.includes('затрагивает'));
});

test('баланс отелей не награждает карточку без решающих данных', () => {
  const sparseCheap = hotel({
    name: 'Только цена',
    best_offer: { price: { amount: 5_000, currency: 'RUB' } },
  });
  const reliable = hotel({
    name: 'Проверенный отель',
    stars: 4,
    address: '1 км от центра, 300 м от метро Тверская',
    review_summary: { rating: 9.2, review_count: 900 },
    best_offer: {
      price: { amount: 6_000, currency: 'RUB' },
      room_size_sqm: 24,
      breakfast_included: true,
      free_cancellation: true,
      pay_at_hotel: true,
    },
  });
  const ranking = rankHotels([sparseCheap, reliable], 'balance');
  assert.equal(ranking[0].hotel.name, 'Проверенный отель');
  assert.ok(ranking[0].confidence > ranking[1].confidence);
});

test('при приоритете цены сохраняется реальное преимущество самого дешёвого отеля', () => {
  const cheap = hotel({
    name: 'Дешёвый',
    review_summary: { rating: 8.5, review_count: 100 },
    best_offer: { price: { amount: 4_000, currency: 'RUB' }, free_cancellation: true },
  });
  const premium = hotel({
    name: 'Дорогой',
    review_summary: { rating: 9.4, review_count: 1_000 },
    best_offer: { price: { amount: 9_000, currency: 'RUB' }, free_cancellation: true },
  });
  assert.equal(rankHotels([premium, cheap], 'price')[0].hotel.name, 'Дешёвый');
});

test('комфорт отеля учитывает статистическую надёжность оценки', () => {
  const oneReview = hotel({
    name: 'Один отзыв',
    stars: 4,
    review_summary: { rating: 10, review_count: 1 },
    best_offer: { price: { amount: 7_000, currency: 'RUB' }, room_size_sqm: 20 },
  });
  const manyReviews = hotel({
    name: 'Много отзывов',
    stars: 4,
    review_summary: { rating: 9.3, review_count: 1_500 },
    best_offer: { price: { amount: 7_000, currency: 'RUB' }, room_size_sqm: 20 },
  });
  assert.equal(rankHotels([oneReview, manyReviews], 'comfort')[0].hotel.name, 'Много отзывов');
});

test('приоритет расположения учитывает абсолютную близость, а не только место в списке', () => {
  const center = hotel({
    name: 'В центре',
    address: '400 м от центра, 250 м от метро Охотный Ряд',
    review_summary: { rating: 8.8, review_count: 400 },
    best_offer: { price: { amount: 8_000, currency: 'RUB' }, free_cancellation: true },
  });
  const outskirts = hotel({
    name: 'На окраине',
    address: '12 км от центра, 2 км от метро Планерная',
    review_summary: { rating: 9, review_count: 400 },
    best_offer: { price: { amount: 6_000, currency: 'RUB' }, free_cancellation: true },
  });
  assert.equal(rankHotels([outskirts, center], 'location')[0].hotel.name, 'В центре');
});

test('приоритет гибкости выбирает подтверждённую бесплатную отмену', () => {
  const flexible = hotel({
    name: 'Гибкий',
    review_summary: { rating: 8.8, review_count: 300 },
    best_offer: {
      price: { amount: 7_000, currency: 'RUB' },
      free_cancellation: true,
      pay_at_hotel: true,
    },
  });
  const strict = hotel({
    name: 'Строгий',
    review_summary: { rating: 9, review_count: 300 },
    best_offer: {
      price: { amount: 6_500, currency: 'RUB' },
      free_cancellation: false,
      pay_at_hotel: false,
    },
  });
  assert.equal(rankHotels([strict, flexible], 'flexibility')[0].hotel.name, 'Гибкий');
});

test('нулевая оценка без отзывов считается отсутствием данных, а не плохим рейтингом', () => {
  const unrated = hotel({
    name: 'Без отзывов',
    rating: 0,
    review_count: 0,
    best_offer: { price: { amount: 5_000, currency: 'RUB' } },
  });
  const [score] = rankHotels([unrated], 'balance');
  assert.equal(score.components.quality, null);
  assert.ok(score.confidence < 50);
});

test('расчёт остаётся быстрым на выдаче существенно больше рабочей', () => {
  const offers = Array.from({ length: 2_000 }, (_, index) =>
    transportOffer({
      offer_id: `offer-${index}`,
      price: { amount: 2_000 + index * 7 },
      duration_min: 80 + (index % 700),
      segments_count: (index % 3) + 1,
    }),
  );
  const started = performance.now();
  const result = scoreOffers(offers, 'balance');
  const elapsed = performance.now() - started;
  assert.equal(result.length, offers.length);
  assert.ok(elapsed < 1_000, `Скоринг занял ${Math.round(elapsed)} мс`);
});
