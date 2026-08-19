import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  CircleHelp,
  Hotel,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import {
  hotelDistanceToCenter,
  hotelMetroInfo,
  rankHotels,
  type HotelPriority,
} from '../../hotelScoring';
import type { HotelOffer } from '../../types';
import {
  formatDate,
  formatMoney,
  hotelGuestRating,
  hotelHighlightText,
  hotelKey,
  hotelPriorities,
  hotelPhotoUrl,
  nightsBetween,
  pluralizeHotels,
  pluralizeReviews,
} from './hotelViewModel';
import './hotels.css';

export function HotelComparisonView({
  hotels,
  checkIn,
  checkOut,
  guests,
  onRemove,
  onBack,
}: {
  hotels: HotelOffer[];
  checkIn: string;
  checkOut: string;
  guests: number;
  onRemove: (hotel: HotelOffer) => void;
  onBack: () => void;
}) {
  const nights = nightsBetween(checkIn, checkOut);
  const [requestedPriority, setPriority] = useState<HotelPriority>('balance');
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [windowStart, setWindowStart] = useState(0);
  const windowSize = 4;
  const maxWindowStart = Math.max(0, hotels.length - windowSize);
  const priorityAvailability = useMemo(() => {
    const dimensions: Partial<
      Record<HotelPriority, keyof ReturnType<typeof rankHotels>[number]['components']>
    > = {
      price: 'price',
      comfort: 'comfort',
      location: 'location',
      flexibility: 'flexibility',
    };
    return Object.fromEntries(
      hotelPriorities.map((item) => {
        const dimension = dimensions[item.id];
        const available =
          !dimension ||
          rankHotels(hotels, item.id).some((score) => score.components[dimension] !== null);
        return [item.id, available];
      }),
    ) as Record<HotelPriority, boolean>;
  }, [hotels]);
  const priority = priorityAvailability[requestedPriority] ? requestedPriority : 'balance';
  const ranking = useMemo(() => rankHotels(hotels, priority), [hotels, priority]);
  const leaderScore = ranking[0];
  const leader = leaderScore?.hotel;
  const leaderUrl =
    leader?.best_offer?.checkout_url ||
    leader?.checkout_url ||
    String(leader?.checkout_ref?.fallback_url || '');
  const safeWindowStart = Math.min(windowStart, maxWindowStart);
  const visibleHotels = hotels.slice(safeWindowStart, safeWindowStart + windowSize);
  const visibleHotelIndices = visibleHotels.map((hotel) =>
    hotels.findIndex((item) => hotelKey(item) === hotelKey(hotel)),
  );

  const rows = useMemo(() => {
    const definitions = [
      {
        key: 'price',
        label: 'Цена за проживание',
        value: (hotel: HotelOffer) =>
          hotel.best_offer?.price
            ? formatMoney(hotel.best_offer.price.amount, hotel.best_offer.price.currency)
            : 'Цена на Туту',
        metric: (hotel: HotelOffer) => hotel.best_offer?.price?.amount,
        best: 'min',
      },
      {
        key: 'night',
        label: 'Цена за ночь',
        value: (hotel: HotelOffer) =>
          hotel.best_offer?.price
            ? formatMoney(
                Math.round(hotel.best_offer.price.amount / nights),
                hotel.best_offer.price.currency,
              )
            : 'Не указана',
        metric: (hotel: HotelOffer) => hotel.best_offer?.price?.amount,
        best: 'min',
      },
      {
        key: 'guestNight',
        label: 'На гостя за ночь',
        value: (hotel: HotelOffer) =>
          hotel.best_offer?.price
            ? formatMoney(
                Math.round(hotel.best_offer.price.amount / nights / Math.max(1, guests)),
                hotel.best_offer.price.currency,
              )
            : 'Не указана',
        metric: (hotel: HotelOffer) => hotel.best_offer?.price?.amount,
        best: 'min',
      },
      {
        key: 'priceBasis',
        label: 'Что входит в цену',
        value: (hotel: HotelOffer) =>
          hotel.best_offer?.price_basis === 'stay_total'
            ? 'Всё проживание'
            : hotel.best_offer?.price_basis || 'Основание не указано',
      },
      {
        key: 'rating',
        label: 'Оценка гостей',
        value: (hotel: HotelOffer) => {
          const rating = hotelGuestRating(hotel);
          return rating !== undefined ? `${rating}/10` : 'Нет оценки';
        },
        metric: hotelGuestRating,
        best: 'max',
      },
      {
        key: 'reviews',
        label: 'Надёжность оценки',
        value: (hotel: HotelOffer) => {
          const count = hotel.review_summary?.review_count ?? hotel.review_count;
          if (count === undefined) return 'Не указано';
          return count > 0
            ? `${count.toLocaleString('ru-RU')} ${pluralizeReviews(count)}`
            : 'Нет отзывов';
        },
        metric: (hotel: HotelOffer) => hotel.review_summary?.review_count ?? hotel.review_count,
        best: 'max',
      },
      {
        key: 'location',
        label: 'До центра',
        value: (hotel: HotelOffer) =>
          hotelDistanceToCenter(hotel) !== undefined
            ? `${Number((hotelDistanceToCenter(hotel) as number).toFixed(1))} км`
            : 'Расстояние не указано',
        metric: hotelDistanceToCenter,
        best: 'min',
      },
      {
        key: 'metroDistance',
        label: 'До метро',
        value: (hotel: HotelOffer) => {
          const metro = hotelMetroInfo(hotel);
          if (!metro) return 'Не указано';
          return metro.distanceMeters >= 1000
            ? `${Number((metro.distanceMeters / 1000).toFixed(1))} км`
            : `${Math.round(metro.distanceMeters)} м`;
        },
        metric: (hotel: HotelOffer) => hotelMetroInfo(hotel)?.distanceMeters,
        best: 'min',
      },
      {
        key: 'metroName',
        label: 'Ближайшее метро',
        value: (hotel: HotelOffer) => hotelMetroInfo(hotel)?.name || 'Не указано',
      },
      {
        key: 'stars',
        label: 'Категория',
        value: (hotel: HotelOffer) => (hotel.stars ? `${hotel.stars}★` : 'Без категории'),
        metric: (hotel: HotelOffer) => hotel.stars,
        best: 'max',
      },
      {
        key: 'breakfast',
        label: 'Завтрак',
        value: (hotel: HotelOffer) =>
          hotel.best_offer?.breakfast_included === true
            ? hotel.best_offer.meal_name || 'Включён'
            : hotel.best_offer?.breakfast_included === false
              ? hotel.best_offer.meal_name || 'Не включён'
              : hotel.best_offer?.meal_name || 'Не указано',
        metric: (hotel: HotelOffer) =>
          typeof hotel.best_offer?.breakfast_included === 'boolean'
            ? Number(hotel.best_offer.breakfast_included)
            : undefined,
        best: 'max',
      },
      {
        key: 'cancellation',
        label: 'Отмена',
        value: (hotel: HotelOffer) =>
          hotel.best_offer?.free_cancellation === true
            ? 'Бесплатная'
            : hotel.best_offer?.free_cancellation === false
              ? 'Не бесплатная'
              : 'Не указано',
        metric: (hotel: HotelOffer) =>
          typeof hotel.best_offer?.free_cancellation === 'boolean'
            ? Number(hotel.best_offer.free_cancellation)
            : undefined,
        best: 'max',
      },
      {
        key: 'roomName',
        label: 'Предлагаемый номер',
        value: (hotel: HotelOffer) => hotel.best_offer?.room_name || 'Тип номера не указан',
      },
      {
        key: 'room',
        label: 'Размер номера',
        value: (hotel: HotelOffer) =>
          hotel.best_offer?.room_size_sqm ? `от ${hotel.best_offer.room_size_sqm} м²` : 'Не указан',
        metric: (hotel: HotelOffer) => hotel.best_offer?.room_size_sqm ?? undefined,
        best: 'max',
      },
      {
        key: 'features',
        label: 'Особенности',
        value: (hotel: HotelOffer) =>
          (hotel.best_offer?.highlights || [])
            .map(hotelHighlightText)
            .filter(Boolean)
            .join(' · ') || 'Нет дополнительных данных',
      },
    ] as Array<{
      key: string;
      label: string;
      value: (hotel: HotelOffer) => string;
      metric?: (hotel: HotelOffer) => number | undefined;
      best?: 'min' | 'max';
    }>;

    return definitions.map((definition) => {
      const values = hotels.map(definition.value);
      const metrics = definition.metric ? hotels.map(definition.metric) : [];
      const known = metrics.filter((value): value is number => Number.isFinite(value));
      const bestValue =
        known.length && definition.best
          ? definition.best === 'min'
            ? Math.min(...known)
            : Math.max(...known)
          : undefined;
      return {
        key: definition.key,
        label: definition.label,
        values,
        best: metrics.map((value) => bestValue !== undefined && value === bestValue),
      };
    });
  }, [guests, hotels, nights]);

  const visibleRows = onlyDifferences
    ? rows.filter((row) => new Set(visibleHotelIndices.map((index) => row.values[index])).size > 1)
    : rows;

  return (
    <section className="comparison-page hotel-comparison">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={18} /> К отелям
      </button>
      <div className="comparison-title">
        <div>
          <span className="section-kicker">Ваш список проживания</span>
          <h2>Сравнение отелей</h2>
          <p>
            {formatDate(checkIn)} — {formatDate(checkOut)} · {hotels.length}{' '}
            {pluralizeHotels(hotels.length)}
          </p>
        </div>
        <label className="differences-toggle">
          <span>Только различия</span>
          <input
            type="checkbox"
            checked={onlyDifferences}
            onChange={(event) => setOnlyDifferences(event.target.checked)}
          />
          <i />
        </label>
      </div>

      {hotels.length < 2 ? (
        <div className="empty-compare">
          <span>
            <Hotel size={34} />
          </span>
          <h3>Добавьте хотя бы два отеля</h3>
          <button type="button" onClick={onBack}>
            Выбрать отели
          </button>
        </div>
      ) : (
        <>
          <div className="advisor-card hotel-advisor">
            <div className="advisor-card__head">
              <span>
                <Sparkles size={23} />
              </span>
              <div>
                <small>Куратор проживания</small>
                <strong>Какой отель подойдёт именно вам?</strong>
              </div>
            </div>
            <div className="advisor-priorities">
              {hotelPriorities.map((item) => (
                <button
                  className={priority === item.id ? 'is-active' : ''}
                  key={item.id}
                  type="button"
                  disabled={!priorityAvailability[item.id]}
                  title={
                    priorityAvailability[item.id]
                      ? undefined
                      : 'В выбранных карточках нет данных для этого критерия'
                  }
                  onClick={() => setPriority(item.id)}
                >
                  {priority === item.id && <Check size={15} />}
                  {item.label}
                </button>
              ))}
            </div>
            {leader && leaderScore && (
              <div className="advisor-verdict hotel-advisor__verdict">
                <BadgeCheck size={27} />
                <div>
                  <span>Рекомендуем · индекс {leaderScore.total}/100</span>
                  <h3>{leader.name}</h3>
                  <p className="curator-summary">{leaderScore.summary}</p>
                  <div className="curator-strengths">
                    {leaderScore.strengths.map((strength) => (
                      <span key={strength}>
                        <Check size={14} /> {strength}
                      </span>
                    ))}
                  </div>
                  <p className="curator-tradeoff">
                    <CircleHelp size={15} /> <strong>Главный компромисс:</strong>{' '}
                    {leaderScore.tradeoff}
                  </p>
                </div>
                {leaderUrl && (
                  <a
                    className="hotel-advisor__checkout"
                    href={leaderUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Перейти на Туту <ChevronRight size={17} />
                  </a>
                )}
              </div>
            )}
          </div>

          {hotels.length > windowSize && (
            <div className="hotel-compare-window" aria-live="polite">
              <div>
                <span>Сейчас в таблице</span>
                <strong>
                  {safeWindowStart + 1}–{Math.min(safeWindowStart + windowSize, hotels.length)} из{' '}
                  {hotels.length}
                </strong>
                <small>Листайте по одному отелю, не теряя контекст сравнения</small>
              </div>
              <div className="hotel-compare-window__controls">
                <button
                  type="button"
                  aria-label="Показать предыдущий отель"
                  disabled={safeWindowStart === 0}
                  onClick={() => setWindowStart(Math.max(0, safeWindowStart - 1))}
                >
                  <ArrowLeft size={20} />
                </button>
                <button
                  type="button"
                  aria-label="Показать следующий отель"
                  disabled={safeWindowStart >= maxWindowStart}
                  onClick={() => setWindowStart(Math.min(maxWindowStart, safeWindowStart + 1))}
                >
                  <ArrowRight size={20} />
                </button>
              </div>
            </div>
          )}

          <div
            className="compare-table hotel-compare-table"
            key={`hotel-window-${safeWindowStart}-${visibleHotels.map(hotelKey).join('-')}`}
            style={{ '--compare-count': visibleHotels.length } as CSSProperties}
          >
            <div className="compare-table__corner">
              <span>Сравниваем</span>
              <strong>{visibleRows.length} параметров</strong>
              <small>
                {nights} {nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей'} · {guests}{' '}
                {guests === 1 ? 'гость' : guests < 5 ? 'гостя' : 'гостей'}
              </small>
            </div>
            {visibleHotels.map((hotel) => {
              const photo = hotel.photos?.map(hotelPhotoUrl).find(Boolean);
              const price = hotel.best_offer?.price;
              const checkoutUrl =
                hotel.best_offer?.checkout_url ||
                hotel.checkout_url ||
                String(hotel.checkout_ref?.fallback_url || '');
              const score = ranking.find((item) => hotelKey(item.hotel) === hotelKey(hotel));
              const isLeader = hotelKey(leader || hotel) === hotelKey(hotel);
              return (
                <article
                  className={`compare-column-head hotel-compare-head ${isLeader ? 'is-leader' : ''}`}
                  key={hotelKey(hotel)}
                >
                  {isLeader && <b>Рекомендуем</b>}
                  <button
                    type="button"
                    onClick={() => onRemove(hotel)}
                    aria-label={`Убрать ${hotel.name}`}
                  >
                    <X size={17} />
                  </button>
                  <div className="hotel-compare-head__photo">
                    {photo ? (
                      <img
                        src={photo}
                        alt={hotel.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Hotel size={30} />
                    )}
                  </div>
                  <span className="hotel-compare-head__meta">
                    {hotel.stars ? `${hotel.stars}★` : 'Отель'} · индекс {score?.total || 0}/100
                  </span>
                  <h3>{hotel.name}</h3>
                  <p>{hotel.address || 'Адрес не указан'}</p>
                  <strong>
                    {price ? formatMoney(price.amount, price.currency) : 'Цена на Туту'}
                  </strong>
                  {checkoutUrl && (
                    <a
                      className="hotel-compare-head__choose"
                      href={checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Перейти на Туту <ChevronRight size={15} />
                    </a>
                  )}
                </article>
              );
            })}

            {visibleRows.map((row) => (
              <div className="compare-row" key={row.key}>
                <div className="compare-row__label">{row.label}</div>
                {visibleHotelIndices.map((hotelIndex) => (
                  <div
                    className={row.best[hotelIndex] ? 'is-best' : ''}
                    key={`${row.key}-${hotelKey(hotels[hotelIndex])}`}
                  >
                    {row.best[hotelIndex] && <Check size={15} />}
                    <span>{row.values[hotelIndex]}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="data-note">
            <ShieldCheck size={16} /> Цены и наличие могут измениться до завершения бронирования.
          </p>
        </>
      )}
    </section>
  );
}
