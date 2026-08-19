import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CircleHelp,
  GitCompareArrows,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import type { Offer, Priority } from '../../types';
import { CheckoutButton } from './CheckoutButton';
import {
  baggageValue,
  buildCuratorVerdict,
  firstSegment,
  formatDate,
  formatDuration,
  formatMoney,
  formatTime,
  lastSegment,
  modeMeta,
  pluralizeVariants,
  priorities,
  ratingValue,
  refundValue,
  seatCategories,
} from './transportViewModel';

export function TransportComparisonView({
  offers,
  priority,
  onPriority,
  onlyDifferences,
  onOnlyDifferences,
  leader,
  onRemove,
  onBack,
  route,
}: {
  offers: Offer[];
  priority: Priority;
  onPriority: (priority: Priority) => void;
  onlyDifferences: boolean;
  onOnlyDifferences: (value: boolean) => void;
  leader: Offer | null;
  onRemove: (offer: Offer) => void;
  onBack: () => void;
  route: string;
}) {
  const rows = useMemo(() => {
    const definitions = [
      ['transport', 'Транспорт', (offer: Offer) => modeMeta[offer.transport].label],
      ['price', 'Цена', (offer: Offer) => formatMoney(offer.price.amount, offer.price.currency)],
      ['duration', 'Время в пути', (offer: Offer) => formatDuration(offer.duration_min)],
      [
        'departure',
        'Отправление',
        (offer: Offer) => `${formatTime(offer.departure_at)} · ${formatDate(offer.departure_at)}`,
      ],
      [
        'arrival',
        'Прибытие',
        (offer: Offer) => `${formatTime(offer.arrival_at)} · ${formatDate(offer.arrival_at)}`,
      ],
      ['from', 'Откуда', (offer: Offer) => firstSegment(offer)?.from || 'Не указано'],
      ['to', 'Куда', (offer: Offer) => lastSegment(offer)?.to || 'Не указано'],
      [
        'changes',
        'Пересадки',
        (offer: Offer) => (offer.analysis.changes ? `${offer.analysis.changes}` : 'Без пересадок'),
      ],
      ['carrier', 'Перевозчик', (offer: Offer) => offer.carriers?.join(', ') || 'Не указан'],
      ['rating', 'Рейтинг', ratingValue],
      ['refund', 'Возврат', refundValue],
      ['baggage', 'Багаж', baggageValue],
      ['class', 'Варианты мест', seatCategories],
      ['stress', 'Нагрузка поездки', (offer: Offer) => `${offer.analysis.stressScore}/100`],
    ] as Array<[string, string, (offer: Offer) => string]>;
    return definitions.map(([key, label, getValue]) => ({
      key,
      label,
      values: offers.map(getValue),
    }));
  }, [offers]);

  const visibleRows = onlyDifferences ? rows.filter((row) => new Set(row.values).size > 1) : rows;

  const leaderMeta = leader ? modeMeta[leader.transport] : null;
  const curatorVerdict = leader ? buildCuratorVerdict(leader, offers, priority) : null;

  return (
    <section className="comparison-page">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={18} /> К результатам
      </button>
      <div className="comparison-title">
        <div>
          <span className="section-kicker">Ваш список поездки</span>
          <h2>Сравнение вариантов</h2>
          <p>
            {route} · {offers.length} {pluralizeVariants(offers.length)}
          </p>
        </div>
        <label className="differences-toggle">
          <span>Только различия</span>
          <input
            type="checkbox"
            checked={onlyDifferences}
            onChange={(event) => onOnlyDifferences(event.target.checked)}
          />
          <i />
        </label>
      </div>

      {offers.length < 2 ? (
        <div className="empty-compare">
          <span>
            <GitCompareArrows size={34} />
          </span>
          <h3>Добавьте хотя бы два варианта</h3>
          <p>Вернитесь к результатам и нажмите «Сравнить» на подходящих карточках.</p>
          <button type="button" onClick={onBack}>
            Выбрать варианты
          </button>
        </div>
      ) : (
        <>
          <div className="advisor-card">
            <div className="advisor-card__head">
              <span>
                <Sparkles size={23} />
              </span>
              <div>
                <small>Куратор Туту</small>
                <strong>Что для вас важнее?</strong>
              </div>
            </div>
            <div className="advisor-priorities">
              {priorities.map((item) => (
                <button
                  className={priority === item.id ? 'is-active' : ''}
                  key={item.id}
                  type="button"
                  onClick={() => onPriority(item.id)}
                >
                  {priority === item.id && <Check size={15} />}
                  {item.label}
                </button>
              ))}
            </div>
            {leader && leaderMeta && curatorVerdict && (
              <div className="advisor-verdict">
                <BadgeCheck size={27} />
                <div>
                  <span>Рекомендуем</span>
                  <h3>
                    {leaderMeta.label} · {formatTime(leader.departure_at)}
                  </h3>
                  <p className="curator-summary">{curatorVerdict.summary}</p>
                  <div className="curator-strengths">
                    {curatorVerdict.strengths.map((strength) => (
                      <span key={strength}>
                        <Check size={14} /> {strength}
                      </span>
                    ))}
                  </div>
                  <p className="curator-tradeoff">
                    <CircleHelp size={15} /> <strong>Главный компромисс:</strong>{' '}
                    {curatorVerdict.tradeoff}
                  </p>
                </div>
                <CheckoutButton
                  className="advisor-checkout"
                  offer={leader}
                  label={`Выбрать за ${formatMoney(leader.price.amount, leader.price.currency)}`}
                />
              </div>
            )}
          </div>

          <div
            className="compare-table"
            style={{ '--compare-count': offers.length } as CSSProperties}
          >
            <div className="compare-table__corner">
              <span>Сравниваем</span>
              <strong>{visibleRows.length} параметров</strong>
            </div>
            {offers.map((offer) => {
              const meta = modeMeta[offer.transport];
              const Icon = meta.icon;
              const isLeader = leader?.offer_id === offer.offer_id;
              return (
                <article
                  className={`compare-column-head ${isLeader ? 'is-leader' : ''}`}
                  key={offer.offer_id}
                >
                  {isLeader && <b>Рекомендуем</b>}
                  <button
                    type="button"
                    onClick={() => onRemove(offer)}
                    aria-label="Удалить из сравнения"
                  >
                    <X size={17} />
                  </button>
                  <span className={`mode-circle mode-circle--${meta.className}`}>
                    <Icon size={24} />
                  </span>
                  <h3>{meta.label}</h3>
                  <p>{offer.carriers?.join(' · ') || 'Перевозчик не указан'}</p>
                  <strong>{formatMoney(offer.price.amount, offer.price.currency)}</strong>
                </article>
              );
            })}

            {visibleRows.map((row) => (
              <div className="compare-row" key={row.key}>
                <div className="compare-row__label">{row.label}</div>
                {row.values.map((value, index) => {
                  const bestPrice =
                    row.key === 'price' &&
                    offers[index].price.amount ===
                      Math.min(...offers.map((offer) => offer.price.amount));
                  const bestDuration =
                    row.key === 'duration' &&
                    offers[index].duration_min ===
                      Math.min(...offers.map((offer) => offer.duration_min));
                  return (
                    <div
                      className={bestPrice || bestDuration ? 'is-best' : ''}
                      key={`${row.key}-${offers[index].offer_id}`}
                    >
                      {(bestPrice || bestDuration) && <Check size={15} />}
                      <span>{value}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="data-note">
            <ShieldCheck size={16} /> Цены и наличие могут измениться до завершения покупки.
          </p>
        </>
      )}
    </section>
  );
}
