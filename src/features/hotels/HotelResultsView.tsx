import { ArrowDown, Check, ChevronRight, GitCompareArrows, Hotel, MapPin } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { hotelDistanceToCenter, hotelMetroInfo } from '../../hotelScoring';
import type { HotelOffer, HotelSearchResponse } from '../../types';
import {
  formatDate,
  formatMoney,
  hotelAmenityOptions,
  hotelGuestRating,
  hotelHighlightText,
  hotelKey,
  hotelMealOptions,
  hotelPhotoUrl,
  hotelRatingLabel,
  hotelTypeOptions,
  initialHotelFilters,
  nightsBetween,
  pluralizeReviews,
  roomAmenityOptions,
  type HotelFilterState,
} from './hotelViewModel';
import './hotels.css';

type HotelSort = 'recommended' | 'price' | 'rating' | 'center';

export function HotelResultsView({
  result,
  city,
  checkIn,
  checkOut,
  shortlist,
  onToggle,
  onApplyFilters,
  filtering,
  onLoadMore,
  loadingMore,
  loadMoreError,
}: {
  result: HotelSearchResponse;
  city: string;
  checkIn: string;
  checkOut: string;
  shortlist: HotelOffer[];
  onToggle: (hotel: HotelOffer) => void;
  onApplyFilters: (filters: HotelFilterState) => void;
  filtering: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
  loadMoreError: string;
}) {
  const nights = result.meta.stay?.nights || nightsBetween(checkIn, checkOut);
  const [filters, setFilters] = useState<HotelFilterState>(initialHotelFilters);
  const [sort, setSort] = useState<HotelSort>('recommended');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterCallbackRef = useRef(onApplyFilters);
  const filtersReadyRef = useRef(false);

  useEffect(() => {
    filterCallbackRef.current = onApplyFilters;
  }, [onApplyFilters]);

  useEffect(() => {
    if (!filtersReadyRef.current) {
      filtersReadyRef.current = true;
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      filterCallbackRef.current(filters);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [filters]);

  const activeFilterCount =
    filters.hotelTypes.length +
    filters.stars.length +
    filters.meals.length +
    filters.hotelAmenities.length +
    filters.roomAmenities.length +
    (filters.priceMin ? 1 : 0) +
    (filters.priceMax ? 1 : 0) +
    (filters.minRating ? 1 : 0) +
    (filters.centerDistanceMax ? 1 : 0) +
    (filters.metroDistanceMax ? 1 : 0) +
    (filters.freeCancellation ? 1 : 0) +
    (filters.breakfastIncluded ? 1 : 0) +
    (filters.payAtHotel ? 1 : 0);

  const toggleStringFilter = (
    field: 'hotelTypes' | 'meals' | 'hotelAmenities' | 'roomAmenities',
    value: string,
  ) => {
    setFilters((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
    }));
  };

  const visibleHotels = useMemo(() => {
    const minimumPrice = filters.priceMin ? Number(filters.priceMin) : undefined;
    const filtered = result.hotels.filter((hotel) => {
      const pricePerNight = hotel.best_offer?.price?.amount
        ? hotel.best_offer.price.amount / nights
        : undefined;
      if (minimumPrice !== undefined && (!pricePerNight || pricePerNight < minimumPrice))
        return false;
      if (filters.centerDistanceMax !== undefined) {
        const distance = hotelDistanceToCenter(hotel);
        if (distance === undefined || distance > filters.centerDistanceMax) return false;
      }
      if (filters.metroDistanceMax !== undefined) {
        const metro = hotelMetroInfo(hotel);
        if (!metro || metro.distanceMeters > filters.metroDistanceMax) return false;
      }
      if (filters.payAtHotel && hotel.best_offer?.pay_at_hotel !== true) return false;
      return true;
    });

    return [...filtered].sort((left, right) => {
      if (sort === 'price')
        return (
          (left.best_offer?.price?.amount || Infinity) -
          (right.best_offer?.price?.amount || Infinity)
        );
      if (sort === 'rating')
        return (hotelGuestRating(right) ?? -1) - (hotelGuestRating(left) ?? -1);
      if (sort === 'center')
        return (
          (hotelDistanceToCenter(left) ?? Infinity) - (hotelDistanceToCenter(right) ?? Infinity)
        );
      return 0;
    });
  }, [
    filters.centerDistanceMax,
    filters.metroDistanceMax,
    filters.payAtHotel,
    filters.priceMin,
    nights,
    result.hotels,
    sort,
  ]);

  return (
    <section className="hotel-results">
      <div className="results-heading">
        <div>
          <span className="section-kicker">Цены и наличие обновлены</span>
          <h2>Отели в городе {city}</h2>
          <p>
            {formatDate(checkIn)} — {formatDate(checkOut)} · {nights}{' '}
            {nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей'} · найдено {result.hotels.length}
          </p>
        </div>
      </div>

      {result.meta.is_cached && (
        <div className="notice-card">
          Показываем последние доступные результаты. Итоговая цена подтвердится перед бронированием.
        </div>
      )}

      <div className="hotel-results-layout">
        <aside
          className={`hotel-filters ${filtersOpen ? 'is-open' : ''}`}
          aria-label="Фильтры отелей"
        >
          <div className="hotel-filters__heading">
            <button
              className="hotel-filters__mobile-toggle"
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((current) => !current)}
            >
              <strong>Фильтры</strong>
              {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
              <ChevronRight size={20} aria-hidden="true" />
            </button>
            {activeFilterCount > 0 && (
              <button
                className="hotel-filters__reset"
                type="button"
                onClick={() => setFilters(initialHotelFilters)}
              >
                Сбросить
              </button>
            )}
          </div>

          <div className="hotel-filters__body">
            <section>
              <h3>Популярные фильтры</h3>
              <label>
                <input
                  type="checkbox"
                  checked={filters.hotelTypes.includes('hotel')}
                  onChange={() => toggleStringFilter('hotelTypes', 'hotel')}
                />{' '}
                Отели
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={filters.hotelTypes.includes('apartments')}
                  onChange={() => toggleStringFilter('hotelTypes', 'apartments')}
                />{' '}
                Квартиры
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={filters.breakfastIncluded}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      breakfastIncluded: event.target.checked,
                    }))
                  }
                />{' '}
                Завтрак включён
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={filters.freeCancellation}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      freeCancellation: event.target.checked,
                    }))
                  }
                />{' '}
                Бесплатная отмена
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={[3, 4, 5].every((star) => filters.stars.includes(star))}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      stars: event.target.checked
                        ? Array.from(new Set([...current.stars, 3, 4, 5]))
                        : current.stars.filter((star) => star < 3),
                    }))
                  }
                />{' '}
                От 3 звёзд
              </label>
            </section>

            <section>
              <h3>Цена за ночь</h3>
              <div className="hotel-filter-price">
                <label>
                  <span>От</span>
                  <input
                    inputMode="numeric"
                    placeholder="0 ₽"
                    value={filters.priceMin}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        priceMin: event.target.value.replace(/\D/g, ''),
                      }))
                    }
                  />
                </label>
                <label>
                  <span>До</span>
                  <input
                    inputMode="numeric"
                    placeholder="Любая"
                    value={filters.priceMax}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        priceMax: event.target.value.replace(/\D/g, ''),
                      }))
                    }
                  />
                </label>
              </div>
            </section>

            <section>
              <h3>Размещение</h3>
              {hotelTypeOptions.map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={filters.hotelTypes.includes(value)}
                    onChange={() => toggleStringFilter('hotelTypes', value)}
                  />{' '}
                  {label}
                </label>
              ))}
            </section>

            <section>
              <h3>Количество звёзд</h3>
              {[5, 4, 3, 2, 1, 0].map((star) => (
                <label key={star}>
                  <input
                    type="checkbox"
                    checked={filters.stars.includes(star)}
                    onChange={() =>
                      setFilters((current) => ({
                        ...current,
                        stars: current.stars.includes(star)
                          ? current.stars.filter((item) => item !== star)
                          : [...current.stars, star],
                      }))
                    }
                  />{' '}
                  {star ? '★'.repeat(star) : 'Без звёзд'}
                </label>
              ))}
            </section>

            <section>
              <h3>Питание</h3>
              {hotelMealOptions.map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={filters.meals.includes(value)}
                    onChange={() => toggleStringFilter('meals', value)}
                  />{' '}
                  {label}
                </label>
              ))}
            </section>

            <section>
              <h3>Рейтинг отелей</h3>
              {[9, 8, 7].map((rating) => (
                <label key={rating}>
                  <input
                    type="radio"
                    name="hotel-rating"
                    checked={filters.minRating === rating}
                    onChange={() => setFilters((current) => ({ ...current, minRating: rating }))}
                  />{' '}
                  Выше {rating}
                </label>
              ))}
              <label>
                <input
                  type="radio"
                  name="hotel-rating"
                  checked={filters.minRating === undefined}
                  onChange={() => setFilters((current) => ({ ...current, minRating: undefined }))}
                />{' '}
                Любой рейтинг
              </label>
            </section>

            <section>
              <h3>До центра</h3>
              {[1, 3, 5].map((distance) => (
                <label key={distance}>
                  <input
                    type="radio"
                    name="hotel-center"
                    checked={filters.centerDistanceMax === distance}
                    onChange={() =>
                      setFilters((current) => ({ ...current, centerDistanceMax: distance }))
                    }
                  />{' '}
                  {distance} км
                </label>
              ))}
              <label>
                <input
                  type="radio"
                  name="hotel-center"
                  checked={filters.centerDistanceMax === undefined}
                  onChange={() =>
                    setFilters((current) => ({ ...current, centerDistanceMax: undefined }))
                  }
                />{' '}
                Любое расстояние
              </label>
            </section>

            <section>
              <h3>До метро</h3>
              {[
                [500, '500 м'],
                [1000, '1 км'],
                [2000, '2 км'],
              ].map(([distance, label]) => (
                <label key={distance}>
                  <input
                    type="radio"
                    name="hotel-metro"
                    checked={filters.metroDistanceMax === distance}
                    onChange={() =>
                      setFilters((current) => ({ ...current, metroDistanceMax: Number(distance) }))
                    }
                  />{' '}
                  {label}
                </label>
              ))}
              <label>
                <input
                  type="radio"
                  name="hotel-metro"
                  checked={filters.metroDistanceMax === undefined}
                  onChange={() =>
                    setFilters((current) => ({ ...current, metroDistanceMax: undefined }))
                  }
                />{' '}
                Любое расстояние
              </label>
            </section>

            <section>
              <h3>Удобства и услуги</h3>
              {hotelAmenityOptions.map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={filters.hotelAmenities.includes(value)}
                    onChange={() => toggleStringFilter('hotelAmenities', value)}
                  />{' '}
                  {label}
                </label>
              ))}
            </section>

            <section>
              <h3>Удобства в номере</h3>
              {roomAmenityOptions.map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={filters.roomAmenities.includes(value)}
                    onChange={() => toggleStringFilter('roomAmenities', value)}
                  />{' '}
                  {label}
                </label>
              ))}
            </section>

            <section>
              <h3>Оплата</h3>
              <label>
                <input
                  type="checkbox"
                  checked={filters.payAtHotel}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, payAtHotel: event.target.checked }))
                  }
                />{' '}
                Оплата при заселении
              </label>
            </section>
          </div>
        </aside>

        <div className={`hotel-results-main ${filtering ? 'is-filtering' : ''}`}>
          <div className="hotel-results-toolbar">
            <span>
              {filtering
                ? 'Обновляем варианты…'
                : `Показано ${visibleHotels.length} из ${result.hotels.length}`}
            </span>
            <label>
              Сортировка
              <select value={sort} onChange={(event) => setSort(event.target.value as HotelSort)}>
                <option value="recommended">Сначала рекомендованные</option>
                <option value="price">Сначала дешевле</option>
                <option value="rating">Сначала с высокой оценкой</option>
                <option value="center">Ближе к центру</option>
              </select>
            </label>
          </div>

          {visibleHotels.length === 0 && (
            <div className="hotel-filter-empty">
              <Hotel size={30} />
              <strong>По этим фильтрам вариантов нет</strong>
              <p>Измените условия или сбросьте фильтры.</p>
            </div>
          )}

          <div className="hotel-list">
            {visibleHotels.map((hotel) => {
              const key = hotelKey(hotel);
              const selected = shortlist.some((item) => hotelKey(item) === key);
              const photos = (hotel.photos || []).map(hotelPhotoUrl).filter(Boolean);
              const price = hotel.best_offer?.price;
              const checkoutUrl =
                hotel.best_offer?.checkout_url ||
                hotel.checkout_url ||
                String(hotel.checkout_ref?.fallback_url || '');
              const rating = hotelGuestRating(hotel);
              const reviewCount = hotel.review_summary?.review_count;
              const highlights = (hotel.best_offer?.highlights || [])
                .map(hotelHighlightText)
                .filter(Boolean)
                .slice(0, 2);
              return (
                <article className="hotel-card" key={key}>
                  <div className="hotel-card__photo">
                    {photos[0] ? (
                      <img
                        src={photos[0]}
                        alt={hotel.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span>
                        <Hotel size={42} />
                      </span>
                    )}
                    {photos.length > 1 && <b>Ещё {photos.length - 1} фото</b>}
                  </div>
                  <div className="hotel-card__body">
                    <div className="hotel-card__eyebrow">
                      {hotel.stars ? (
                        <span>{'★'.repeat(Math.min(5, hotel.stars))}</span>
                      ) : (
                        <span>Без категории</span>
                      )}
                    </div>
                    <h3>{hotel.name}</h3>
                    {hotel.address && (
                      <p className="hotel-card__address">
                        <MapPin size={16} /> {hotel.address}
                      </p>
                    )}
                    <div className="hotel-card__features">
                      {hotel.best_offer?.breakfast_included === true && (
                        <span>
                          <Check size={14} /> Завтрак включён
                        </span>
                      )}
                      {hotel.best_offer?.meal_name && <span>{hotel.best_offer.meal_name}</span>}
                      {hotel.best_offer?.free_cancellation === true && (
                        <span>
                          <Check size={14} /> Бесплатная отмена
                        </span>
                      )}
                      {hotel.best_offer?.pay_at_hotel === true && <span>Оплата в отеле</span>}
                      {hotel.best_offer?.room_size_sqm && (
                        <span>Номер от {hotel.best_offer.room_size_sqm} м²</span>
                      )}
                      {highlights.map((highlight, index) => (
                        <span key={`${highlight}-${index}`}>{highlight}</span>
                      ))}
                    </div>
                    <button
                      className={`hotel-compare-toggle ${selected ? 'is-selected' : ''}`}
                      type="button"
                      onClick={() => onToggle(hotel)}
                    >
                      {selected ? <Check size={17} /> : <GitCompareArrows size={17} />}
                      {selected ? 'В сравнении' : 'Сравнить'}
                    </button>
                  </div>
                  <aside className="hotel-card__aside">
                    {rating !== undefined && (
                      <div className="hotel-rating">
                        <div>
                          <strong>{hotelRatingLabel(rating)}</strong>
                          {reviewCount && (
                            <small>
                              {reviewCount.toLocaleString('ru-RU')} {pluralizeReviews(reviewCount)}
                            </small>
                          )}
                        </div>
                        <b>{rating}</b>
                      </div>
                    )}
                    <div className="hotel-card__price">
                      <small>
                        за {nights} {nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей'}
                      </small>
                      <strong>
                        {price ? formatMoney(price.amount, price.currency) : 'Цена на Туту'}
                      </strong>
                    </div>
                    {checkoutUrl ? (
                      <a
                        className="hotel-card__choose"
                        href={checkoutUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Выбрать отель <ChevronRight size={18} />
                      </a>
                    ) : (
                      <span className="hotel-card__unavailable">Переход временно недоступен</span>
                    )}
                  </aside>
                </article>
              );
            })}
          </div>

          {loadMoreError && <div className="load-more-error">{loadMoreError}</div>}
          {result.meta.has_more && (
            <div className="load-more-block">
              <button type="button" onClick={onLoadMore} disabled={loadingMore || filtering}>
                {loadingMore ? 'Загружаем отели…' : 'Показать ещё отели'} <ArrowDown size={19} />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
