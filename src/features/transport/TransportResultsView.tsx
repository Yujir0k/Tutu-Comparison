import {
  ArrowDown,
  BriefcaseBusiness,
  Check,
  GitCompareArrows,
  Luggage,
  MessageSquareText,
  Search,
  Star,
} from 'lucide-react';
import { useMemo } from 'react';
import type { Offer, Priority, SearchResponse, TransportMode } from '../../types';
import { CheckoutButton } from './CheckoutButton';
import {
  baggageLabel,
  baggageUpgradeLabel,
  cabinBaggageLabel,
  firstSegment,
  formatDuration,
  formatDate,
  formatMoney,
  formatTripDate,
  formatTime,
  lastSegment,
  modeMeta,
  placeParts,
  pluralizeReviews,
  pluralizeVariants,
  priorities,
  rankOffers,
  seatCategories,
} from './transportViewModel';

export function TransportResultsView({
  result,
  shortlist,
  onToggle,
  onLoadMore,
  loadingMore,
  loadMoreError,
  priority,
  directOnly,
  priceMax,
  onResetFilters,
  route,
}: {
  result: SearchResponse;
  shortlist: Offer[];
  onToggle: (offer: Offer) => void;
  onLoadMore: () => void;
  loadingMore: boolean;
  loadMoreError: string;
  priority: Priority | null;
  directOnly: boolean;
  priceMax: string;
  onResetFilters: () => void;
  route: string;
}) {
  const visibleOffers = useMemo(() => {
    const maxPrice = priceMax ? Number(priceMax) : null;
    const filtered = result.variants.filter((offer) => {
      if (directOnly && offer.analysis.changes > 0) return false;
      if (maxPrice !== null && Number.isFinite(maxPrice) && offer.price.amount > maxPrice)
        return false;
      return true;
    });

    return priority ? rankOffers(filtered, priority) : filtered;
  }, [directOnly, priceMax, priority, result.variants]);

  const filtersActive = directOnly || Boolean(priceMax);
  const activePriorityLabel = priorities.find((item) => item.id === priority)?.label;
  const unavailableSourceSummary = Array.from(
    new Set(
      (result.meta.unavailable || []).map((entry) => {
        if (typeof entry === 'string') return entry;
        const label =
          entry.mode && entry.mode in modeMeta
            ? modeMeta[entry.mode as TransportMode].label.toLowerCase()
            : 'источник';
        return `${label}: ${entry.reason || 'не ответил после повторных попыток'}`;
      }),
    ),
  );

  return (
    <section className="results-section">
      <div className="results-heading">
        <div>
          <span className="section-kicker">Цены и наличие обновлены</span>
          <h2>{route}</h2>
          <p>
            {formatDate(result.variants[0]?.departure_at)} · показано {visibleOffers.length}{' '}
            {pluralizeVariants(visibleOffers.length)}
            {visibleOffers.length !== result.variants.length ? ` из ${result.variants.length}` : ''}
          </p>
        </div>
      </div>

      {result.meta.unavailable && result.meta.unavailable.length > 0 && (
        <div className="notice-card">
          Не удалось обновить после повторных попыток: {unavailableSourceSummary.join('; ')}.
          Остальные реальные варианты показаны.
        </div>
      )}

      {result.meta.is_cached && (
        <div className="notice-card">
          Показываем последние доступные результаты. Итоговая цена подтвердится перед покупкой.
        </div>
      )}

      {result.meta.passenger_note && (
        <div className="notice-card">{result.meta.passenger_note}</div>
      )}

      {(activePriorityLabel || filtersActive) && (
        <div className="active-result-controls">
          <span>Выдача обновлена без нового поиска</span>
          {activePriorityLabel && <b>Сначала: {activePriorityLabel.toLowerCase()}</b>}
          {directOnly && <b>Без пересадок</b>}
          {priceMax && <b>До {Number(priceMax).toLocaleString('ru-RU')} ₽</b>}
          <button type="button" onClick={onResetFilters}>
            Сбросить всё
          </button>
        </div>
      )}

      <div className="result-list">
        {visibleOffers.map((offer, index) => {
          const meta = modeMeta[offer.transport];
          const Icon = meta.icon;
          const selected = shortlist.some((item) => item.offer_id === offer.offer_id);
          const recommendation = result.recommendations.find(
            (item) => item.offerId === offer.offer_id,
          );
          const segmentFrom = firstSegment(offer);
          const segmentTo = lastSegment(offer);
          const from = placeParts(segmentFrom?.from);
          const to = placeParts(segmentTo?.to);
          const tripNumber = segmentFrom?.voyage_no;
          const vehicleName = segmentFrom?.vehicle_meta?.name;
          const fareConditions = offer.variants?.[0]?.conditions;
          const baggage = baggageLabel(offer);
          const cabinBaggage = cabinBaggageLabel(offer);
          const baggageUpgrade = baggageUpgradeLabel(offer);
          const seatTypes = seatCategories(offer);
          const hasRailFacts = offer.transport === 'railway' && Boolean(offer.fares);
          return (
            <article className={`offer-card offer-card--${meta.className}`} key={offer.offer_id}>
              <div className="offer-card__main">
                <div className="offer-card__carrier">
                  <span>
                    <Icon size={25} />
                  </span>
                  <div>
                    <strong>{offer.carriers?.join(' · ') || meta.label}</strong>
                    <small>
                      {meta.label}
                      {tripNumber ? ` ${tripNumber}` : ''}
                      {vehicleName ? ` · ${vehicleName}` : ''}
                    </small>
                  </div>
                  {recommendation && <b>{recommendation.eyebrow}</b>}
                </div>
                <div className="route-times">
                  <strong>{formatTime(offer.departure_at)}</strong>
                  <div>
                    <small>{formatDuration(offer.duration_min)} в пути</small>
                    <span />
                    <b>
                      {offer.analysis.changes === 0
                        ? 'Прямой'
                        : `${offer.analysis.changes} ${offer.analysis.changes === 1 ? 'пересадка' : 'пересадки'}`}
                    </b>
                  </div>
                  <strong>{formatTime(offer.arrival_at)}</strong>
                </div>
                <div className="route-places">
                  <div title={segmentFrom?.from}>
                    <small>{formatTripDate(offer.departure_at)}</small>
                    <strong>{from.terminal}</strong>
                    {from.city && <span>{from.city}</span>}
                  </div>
                  <div title={segmentTo?.to}>
                    <small>{formatTripDate(offer.arrival_at)}</small>
                    <strong>{to.terminal}</strong>
                    {to.city && <span>{to.city}</span>}
                  </div>
                </div>
                <div className="offer-card__footer">
                  <button
                    className={`compare-toggle ${selected ? 'is-selected' : ''}`}
                    type="button"
                    onClick={() => onToggle(offer)}
                    disabled={!selected && shortlist.length >= 4}
                    title={
                      !selected && shortlist.length >= 4
                        ? 'Можно сравнить не больше 4 вариантов'
                        : undefined
                    }
                  >
                    {selected ? <Check size={18} /> : <GitCompareArrows size={18} />}
                    {selected ? 'В сравнении' : 'Сравнить'}
                  </button>
                  <div className="offer-tags">
                    {offer.analysis.overnight && <span>Ночной маршрут</span>}
                    {segmentFrom?.vehicle_meta?.is_premium && <span>Фирменный</span>}
                    {segmentFrom?.vehicle_meta?.is_double_decker && <span>Двухэтажный</span>}
                    {offer.is_multi_pnr && <span className="is-warning">Отдельные билеты</span>}
                  </div>
                </div>
              </div>
              <aside className="offer-card__buy">
                {offer.review_summary?.rating !== undefined && (
                  <div className="offer-review">
                    <span>
                      <MessageSquareText size={16} />
                      {offer.review_summary.review_count
                        ? `${offer.review_summary.review_count.toLocaleString('ru-RU')} ${pluralizeReviews(offer.review_summary.review_count)}`
                        : 'Есть отзывы'}
                    </span>
                    <b>{offer.review_summary.rating}</b>
                  </div>
                )}
                <div className="offer-facts">
                  {cabinBaggage && (
                    <span>
                      <BriefcaseBusiness size={17} /> {cabinBaggage}
                    </span>
                  )}
                  {baggage && (
                    <span className={baggage === 'Без багажа' ? 'is-muted' : ''}>
                      <Luggage size={17} /> {baggage}
                    </span>
                  )}
                  {baggageUpgrade && (
                    <span>
                      <Luggage size={17} /> {baggageUpgrade}
                    </span>
                  )}
                  {fareConditions?.fare_family && <span>Тариф «{fareConditions.fare_family}»</span>}
                  {hasRailFacts && <span>{seatTypes}</span>}
                  {hasRailFacts && offer.fares?.refundable_count !== undefined && (
                    <span>
                      {offer.fares.refundable_count > 0
                        ? `${offer.fares.refundable_count} возвратных тарифов`
                        : 'Возвратных тарифов нет'}
                    </span>
                  )}
                  {offer.review_summary?.aspects?.slice(0, 2).map((aspect) => (
                    <span key={aspect.text || aspect.label}>
                      <Star size={14} fill="currentColor" /> {aspect.text || 'Оценка'}:{' '}
                      {aspect.rating ?? '—'}/10
                    </span>
                  ))}
                </div>
                <div className="offer-price">
                  <div>
                    <strong>{formatMoney(offer.price.amount, offer.price.currency)}</strong>
                    <small>{offer.transport === 'railway' ? 'билет от' : 'за всех'}</small>
                  </div>
                  <CheckoutButton offer={offer} label="Выбрать билет" />
                </div>
              </aside>
              {index === 0 && <span className="offer-card__topline" />}
            </article>
          );
        })}
      </div>

      {visibleOffers.length === 0 && (
        <div className="empty-filter-results">
          <span>
            <Search size={28} />
          </span>
          <h3>Нет вариантов с такими условиями</h3>
          <p>Снимите часть фильтров — исходная выдача уже загружена.</p>
          <button type="button" onClick={onResetFilters}>
            Сбросить фильтры
          </button>
        </div>
      )}

      {loadMoreError && <div className="load-more-error">{loadMoreError}</div>}

      {result.meta.has_more && (
        <div className="load-more-block">
          <button type="button" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Загружаем варианты…' : 'Показать ещё'}
            <ArrowDown size={19} />
          </button>
          <span>
            Ещё есть:{' '}
            {Object.entries(result.meta.mode_pagination || {})
              .filter(([, page]) => page?.has_more)
              .map(([mode]) => modeMeta[mode as TransportMode].label.toLowerCase())
              .join(', ') || 'другие варианты'}
          </span>
        </div>
      )}
    </section>
  );
}
