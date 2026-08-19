import {
  ArrowRight,
  ArrowRightLeft,
  BusFront,
  CircleHelp,
  GitCompareArrows,
  Hotel,
  Plane,
  Search,
  ShieldCheck,
  Sparkles,
  TrainFront,
  TramFront,
  X,
  Zap,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header';
import { DatePicker } from './components/DatePicker';
import { LocationAutocomplete } from './components/LocationAutocomplete';
import { PassengerPicker } from './components/PassengerPicker';
import { HotelComparisonView } from './features/hotels/HotelComparisonView';
import { HotelResultsView } from './features/hotels/HotelResultsView';
import { hotelKey, type HotelFilterState } from './features/hotels/hotelViewModel';
import { TransportComparisonView } from './features/transport/TransportComparisonView';
import { TransportResultsView } from './features/transport/TransportResultsView';
import {
  modeMeta,
  pluralizeHotels,
  pluralizeVariants,
  priorities,
  rankOffers,
} from './features/transport/transportViewModel';
import { isConfirmedLocation, type TravelLocation } from './locations';
import { recommendOffers, scoreOffers } from './scoring';
import type {
  Offer,
  HotelOffer,
  HotelSearchPayload,
  HotelSearchResponse,
  Priority,
  SearchPayload,
  SearchResponse,
  TransportMode,
} from './types';

const modes: Array<{
  id: TransportMode | 'all';
  label: string;
  icon: typeof Plane;
}> = [
  { id: 'all', label: 'Все варианты', icon: GitCompareArrows },
  { id: 'avia', label: 'Авиабилеты', icon: Plane },
  { id: 'railway', label: 'Ж/д билеты', icon: TrainFront },
  { id: 'bus', label: 'Автобусы', icon: BusFront },
  { id: 'etrain', label: 'Электрички', icon: TramFront },
];

interface FormState {
  origin: string;
  originId?: string;
  destination: string;
  destinationId?: string;
  departureDate: string;
  checkoutDate: string;
  adults: number;
  childrenAges: number[];
  priceMax: string;
  directOnly: boolean;
  priority: Priority | null;
  modes: TransportMode[];
}

function futureDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function addDaysIso(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const initialForm: FormState = {
  origin: 'Москва',
  originId: 'moscow',
  destination: 'Санкт-Петербург',
  destinationId: 'saint-petersburg',
  departureDate: futureDate(7),
  checkoutDate: futureDate(9),
  adults: 1,
  childrenAges: [],
  priceMax: '',
  directOnly: false,
  priority: 'balance',
  modes: ['avia', 'railway', 'bus', 'etrain'],
};

function App() {
  const [product, setProduct] = useState<'transport' | 'hotel'>('transport');
  const [form, setForm] = useState<FormState>(initialForm);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [hotelResult, setHotelResult] = useState<HotelSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filteringHotels, setFilteringHotels] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState('');
  const [error, setError] = useState('');
  const [showCompare, setShowCompare] = useState(false);
  const [onlyDifferences, setOnlyDifferences] = useState(true);
  const [comparePriority, setComparePriority] = useState<Priority>('balance');
  const [shortlist, setShortlist] = useState<Offer[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('tutu-compare-list') || '[]') as Offer[];
    } catch {
      return [];
    }
  });
  const [hotelShortlist, setHotelShortlist] = useState<HotelOffer[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('tutu-hotel-compare-list') || '[]') as HotelOffer[];
    } catch {
      return [];
    }
  });
  const contentRef = useRef<HTMLElement>(null);
  const searchFormRef = useRef<HTMLFormElement>(null);
  const lastSearchRef = useRef<SearchPayload | null>(null);
  const lastHotelSearchRef = useRef<HotelSearchPayload | null>(null);
  const hotelFilterRequestRef = useRef(0);

  useEffect(() => {
    localStorage.setItem('tutu-compare-list', JSON.stringify(shortlist));
  }, [shortlist]);

  useEffect(() => {
    localStorage.setItem('tutu-hotel-compare-list', JSON.stringify(hotelShortlist));
  }, [hotelShortlist]);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    const originId = form.originId;
    const destinationId = form.destinationId;

    if (product === 'hotel') {
      if (!destinationId || !isConfirmedLocation(destinationId, form.destination)) {
        setHotelResult(null);
        setError('Выберите город или курорт из выпадающего списка');
        return;
      }
      if (form.checkoutDate <= form.departureDate) {
        setHotelResult(null);
        setError('Дата выезда должна быть позже даты заезда');
        return;
      }

      setLoading(true);
      setError('');
      setLoadMoreError('');
      setShowCompare(false);
      setHotelShortlist([]);
      const payload: HotelSearchPayload = {
        cityName: form.destination,
        checkIn: form.departureDate,
        checkOut: form.checkoutDate,
        adults: form.adults,
        childrenAges: form.childrenAges,
        page: 1,
      };

      try {
        const response = await fetch('/api/hotels', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = (await response.json()) as HotelSearchResponse & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Не удалось найти отели');
        setHotelResult(data);
        lastHotelSearchRef.current = payload;
        window.setTimeout(() => contentRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
      } catch (searchError) {
        setError(searchError instanceof Error ? searchError.message : 'Не удалось найти отели');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!originId || !isConfirmedLocation(originId, form.origin)) {
      setResult(null);
      setError('Выберите город отправления из выпадающего списка');
      return;
    }
    if (!destinationId || !isConfirmedLocation(destinationId, form.destination)) {
      setResult(null);
      setError('Выберите город прибытия из выпадающего списка');
      return;
    }
    if (originId === destinationId) {
      setResult(null);
      setError('Города отправления и прибытия должны отличаться');
      return;
    }

    setLoading(true);
    setError('');
    setLoadMoreError('');
    setShowCompare(false);
    setShortlist([]);

    const payload: SearchPayload = {
      origin: form.origin,
      originId,
      destination: form.destination,
      destinationId,
      departureDate: form.departureDate,
      adults: form.adults,
      childrenAges: form.childrenAges,
      priority: 'balance',
      priceMax: undefined,
      directOnly: false,
      modes: form.modes,
      page: 1,
    };

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as SearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Не удалось выполнить поиск');
      setResult(data);
      lastSearchRef.current = payload;
      window.setTimeout(() => contentRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Что-то пошло не так');
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!result?.meta.has_more || loadingMore || !lastSearchRef.current) return;
    setLoadingMore(true);
    setLoadMoreError('');
    const nextPage = (result.meta.page || 1) + 1;
    const modesWithMore = Object.entries(result.meta.mode_pagination || {})
      .filter(([, pagination]) => pagination?.has_more)
      .map(([mode]) => mode as TransportMode);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...lastSearchRef.current,
          modes: modesWithMore.length ? modesWithMore : lastSearchRef.current.modes,
          page: nextPage,
        }),
      });
      const data = (await response.json()) as SearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Не удалось загрузить следующую страницу');

      setResult((current) => {
        if (!current) return data;
        const known = new Set(current.variants.map((offer) => offer.offer_id));
        const newOffers = data.variants.filter((offer) => !known.has(offer.offer_id));
        const variants = scoreOffers([...current.variants, ...newOffers], 'balance') as Offer[];
        return {
          ...current,
          elapsedMs: current.elapsedMs + data.elapsedMs,
          variants,
          recommendations: recommendOffers(variants),
          agents: data.agents,
          meta: {
            ...current.meta,
            ...data.meta,
            total_returned: variants.length,
          },
        };
      });
    } catch (loadError) {
      setLoadMoreError(
        loadError instanceof Error ? loadError.message : 'Не удалось загрузить варианты',
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const loadMoreHotels = async () => {
    if (!hotelResult?.meta.has_more || loadingMore || !lastHotelSearchRef.current) return;
    setLoadingMore(true);
    setLoadMoreError('');
    const nextPage = (hotelResult.meta.page || 1) + 1;

    try {
      const response = await fetch('/api/hotels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...lastHotelSearchRef.current, page: nextPage }),
      });
      const data = (await response.json()) as HotelSearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Не удалось загрузить ещё отели');
      setHotelResult((current) => {
        if (!current) return data;
        const known = new Set(current.hotels.map(hotelKey));
        const hotels = [
          ...current.hotels,
          ...data.hotels.filter((hotel) => !known.has(hotelKey(hotel))),
        ];
        return {
          ...data,
          hotels,
          meta: { ...data.meta, total_returned: hotels.length },
        };
      });
    } catch (loadError) {
      setLoadMoreError(
        loadError instanceof Error ? loadError.message : 'Не удалось загрузить ещё отели',
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const applyHotelFilters = async (filters: HotelFilterState) => {
    if (!lastHotelSearchRef.current) return;
    const requestId = hotelFilterRequestRef.current + 1;
    hotelFilterRequestRef.current = requestId;
    const payload: HotelSearchPayload = {
      ...lastHotelSearchRef.current,
      page: 1,
      stars: filters.stars.length ? filters.stars : undefined,
      priceMax: filters.priceMax ? Number(filters.priceMax) : undefined,
      meals: filters.meals.length ? filters.meals : undefined,
      hotelTypes: filters.hotelTypes.length ? filters.hotelTypes : undefined,
      minRating: filters.minRating,
      freeCancellation: filters.freeCancellation || undefined,
      breakfastIncluded: filters.breakfastIncluded || undefined,
      hotelAmenities: filters.hotelAmenities.length ? filters.hotelAmenities : undefined,
      roomAmenities: filters.roomAmenities.length ? filters.roomAmenities : undefined,
    };

    setFilteringHotels(true);
    setLoadMoreError('');
    try {
      const response = await fetch('/api/hotels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as HotelSearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Не удалось применить фильтры');
      if (requestId !== hotelFilterRequestRef.current) return;
      setHotelResult(data);
      lastHotelSearchRef.current = payload;
    } catch (filterError) {
      if (requestId !== hotelFilterRequestRef.current) return;
      setLoadMoreError(
        filterError instanceof Error ? filterError.message : 'Не удалось применить фильтры',
      );
    } finally {
      if (requestId === hotelFilterRequestRef.current) setFilteringHotels(false);
    }
  };

  const toggleMode = (mode: TransportMode | 'all') => {
    setProduct('transport');
    setShowCompare(false);
    setError('');
    if (mode === 'all') {
      setForm((current) => ({
        ...current,
        modes: current.modes.length === 4 ? [] : ['avia', 'railway', 'bus', 'etrain'],
      }));
      return;
    }
    setForm((current) => {
      const exists = current.modes.includes(mode);
      return {
        ...current,
        modes: exists ? current.modes.filter((item) => item !== mode) : [...current.modes, mode],
      };
    });
  };

  const updateLocationInput = (field: 'origin' | 'destination', value: string) => {
    const idField = field === 'origin' ? 'originId' : 'destinationId';
    setForm((current) => ({ ...current, [field]: value, [idField]: undefined }));
    setResult(null);
    setHotelResult(null);
    lastSearchRef.current = null;
    lastHotelSearchRef.current = null;
    setError('');
    setShowCompare(false);
    setShortlist([]);
  };

  const selectLocation = (field: 'origin' | 'destination', location: TravelLocation) => {
    const idField = field === 'origin' ? 'originId' : 'destinationId';
    setForm((current) => ({ ...current, [field]: location.name, [idField]: location.id }));
    setError('');
  };

  const toggleShortlist = (offer: Offer) => {
    setShortlist((current) => {
      const exists = current.some((item) => item.offer_id === offer.offer_id);
      if (exists) return current.filter((item) => item.offer_id !== offer.offer_id);
      if (current.length >= 4) return current;
      return [...current, offer];
    });
  };

  const toggleHotelShortlist = (hotel: HotelOffer) => {
    setHotelShortlist((current) => {
      const key = hotelKey(hotel);
      const exists = current.some((item) => hotelKey(item) === key);
      if (exists) return current.filter((item) => hotelKey(item) !== key);
      return [...current, hotel];
    });
  };

  const openCompare = () => {
    setShowCompare(true);
    window.setTimeout(() => contentRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
  };

  const comparisonOffers = useMemo(
    () => scoreOffers(shortlist, comparePriority) as Offer[],
    [shortlist, comparePriority],
  );

  const leader = useMemo(() => {
    if (!comparisonOffers.length) return null;
    return rankOffers(comparisonOffers, comparePriority)[0];
  }, [comparisonOffers, comparePriority]);

  const resolvedFrom = result?.meta.from?.name || form.origin;
  const resolvedTo = result?.meta.to?.name || form.destination;
  const locationsReady =
    isConfirmedLocation(form.originId, form.origin) &&
    isConfirmedLocation(form.destinationId, form.destination) &&
    form.originId !== form.destinationId;
  const hotelLocationReady = isConfirmedLocation(form.destinationId, form.destination);
  const activeCompareCount = product === 'hotel' ? hotelShortlist.length : shortlist.length;

  return (
    <div className="app-shell">
      <Header compareCount={activeCompareCount} onCompare={openCompare} />

      <section className="hero">
        <div className="hero__inner">
          <div className="promo-strip">✨ Новое на Туту — сравнивайте варианты в одном месте</div>

          <div className="hero__heading-row">
            <div>
              <span className="new-badge">Новый раздел</span>
              <h1>Сравните — и путешествуйте выгодно</h1>
              <div className="trust-row">
                <span>
                  <ShieldCheck size={18} /> Только реальные варианты Туту
                </span>
                <span>
                  <GitCompareArrows size={18} /> Все различия на одном экране
                </span>
              </div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="hero-art__orbit" />
              <GitCompareArrows size={70} />
              <span>vs</span>
            </div>
          </div>

          <div
            className="product-tabs product-tabs--main"
            role="group"
            aria-label="Категории поиска"
          >
            {modes.map((mode) => {
              const Icon = mode.icon;
              const active =
                product === 'transport' &&
                (mode.id === 'all'
                  ? form.modes.length === 4
                  : form.modes.includes(mode.id as TransportMode));
              return (
                <button
                  className={`product-tab ${active ? 'product-tab--active' : ''}`}
                  key={mode.id}
                  type="button"
                  onClick={() => toggleMode(mode.id)}
                  aria-pressed={active}
                >
                  <span>
                    <Icon size={29} strokeWidth={2.4} />
                  </span>
                  {mode.label}
                </button>
              );
            })}
            <button
              className={`product-tab ${product === 'hotel' ? 'product-tab--active' : ''}`}
              type="button"
              onClick={() => {
                setProduct('hotel');
                setShowCompare(false);
                setError('');
              }}
              aria-pressed={product === 'hotel'}
            >
              <span>
                <Hotel size={29} strokeWidth={2.4} />
              </span>
              Отели
            </button>
          </div>

          <form
            ref={searchFormRef}
            className={`search-form ${product === 'hotel' ? 'search-form--hotel' : ''}`}
            onSubmit={handleSearch}
          >
            {product === 'transport' ? (
              <>
                <LocationAutocomplete
                  className="search-field--from"
                  label="Откуда"
                  value={form.origin}
                  selectedId={form.originId}
                  excludeId={form.destinationId}
                  onInput={(value) => updateLocationInput('origin', value)}
                  onSelect={(location) => selectLocation('origin', location)}
                />
                <button
                  className="swap-button"
                  type="button"
                  aria-label="Поменять местами"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      origin: current.destination,
                      originId: current.destinationId,
                      destination: current.origin,
                      destinationId: current.originId,
                    }))
                  }
                >
                  <ArrowRightLeft size={19} />
                </button>
                <LocationAutocomplete
                  className="search-field--to"
                  label="Куда"
                  value={form.destination}
                  selectedId={form.destinationId}
                  excludeId={form.originId}
                  onInput={(value) => updateLocationInput('destination', value)}
                  onSelect={(location) => selectLocation('destination', location)}
                />
                <DatePicker
                  value={form.departureDate}
                  min={futureDate(1)}
                  onChange={(departureDate) =>
                    setForm((current) => ({ ...current, departureDate }))
                  }
                />
              </>
            ) : (
              <>
                <LocationAutocomplete
                  className="search-field--hotel-city"
                  label="Город или курорт"
                  value={form.destination}
                  selectedId={form.destinationId}
                  onInput={(value) => updateLocationInput('destination', value)}
                  onSelect={(location) => selectLocation('destination', location)}
                />
                <DatePicker
                  label="Заезд"
                  value={form.departureDate}
                  min={futureDate(1)}
                  onChange={(departureDate) =>
                    setForm((current) => ({
                      ...current,
                      departureDate,
                      checkoutDate:
                        current.checkoutDate <= departureDate
                          ? addDaysIso(departureDate, 2)
                          : current.checkoutDate,
                    }))
                  }
                />
                <DatePicker
                  label="Выезд"
                  value={form.checkoutDate}
                  min={addDaysIso(form.departureDate, 1)}
                  onChange={(checkoutDate) => setForm((current) => ({ ...current, checkoutDate }))}
                />
              </>
            )}
            <PassengerPicker
              adults={form.adults}
              childrenAges={form.childrenAges}
              context={product}
              onAdultsChange={(adults) => setForm((current) => ({ ...current, adults }))}
              onChildrenAgesChange={(childrenAges) =>
                setForm((current) => ({ ...current, childrenAges }))
              }
            />
            <button
              className="search-button"
              type="submit"
              disabled={
                loading ||
                (product === 'transport'
                  ? form.modes.length === 0 || !locationsReady
                  : !hotelLocationReady)
              }
              title={
                product === 'transport' && form.modes.length === 0
                  ? 'Выберите хотя бы один вид транспорта'
                  : undefined
              }
            >
              {loading
                ? 'Ищем…'
                : product === 'hotel'
                  ? hotelLocationReady
                    ? 'Найти отели'
                    : 'Выберите город'
                  : form.modes.length === 0
                    ? 'Выберите транспорт'
                    : !locationsReady
                      ? 'Выберите город'
                      : 'Найти варианты'}
            </button>
          </form>

          {product === 'transport' && (
            <div className="quick-filters">
              <span>Что важнее:</span>
              {priorities.map((priority) => (
                <button
                  className={form.priority === priority.id ? 'is-active' : ''}
                  key={priority.id}
                  type="button"
                  aria-pressed={form.priority === priority.id}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      priority: current.priority === priority.id ? null : priority.id,
                    }))
                  }
                >
                  {priority.label}
                </button>
              ))}
              <label className={form.directOnly ? 'is-active' : ''}>
                <input
                  type="checkbox"
                  checked={form.directOnly}
                  onChange={(event) => setForm({ ...form, directOnly: event.target.checked })}
                />
                Без пересадок
              </label>
              <div className={`budget-filter ${form.priceMax ? 'is-active' : ''}`}>
                До
                <input
                  aria-label="До ₽"
                  inputMode="numeric"
                  placeholder="любой цены"
                  value={form.priceMax}
                  onChange={(event) =>
                    setForm({ ...form, priceMax: event.target.value.replace(/\D/g, '') })
                  }
                />
                ₽
                {form.priceMax && (
                  <button
                    className="budget-filter__clear"
                    type="button"
                    aria-label="Сбросить максимальную цену"
                    onClick={() => setForm((current) => ({ ...current, priceMax: '' }))}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <main className="content" ref={contentRef}>
        <div className="content__inner">
          {showCompare ? (
            product === 'hotel' ? (
              <HotelComparisonView
                hotels={hotelShortlist}
                checkIn={form.departureDate}
                checkOut={form.checkoutDate}
                guests={form.adults + form.childrenAges.length}
                onRemove={toggleHotelShortlist}
                onBack={() => setShowCompare(false)}
              />
            ) : (
              <TransportComparisonView
                offers={comparisonOffers}
                priority={comparePriority}
                onPriority={setComparePriority}
                onlyDifferences={onlyDifferences}
                onOnlyDifferences={setOnlyDifferences}
                leader={leader}
                onRemove={toggleShortlist}
                onBack={() => setShowCompare(false)}
                route={`${resolvedFrom} → ${resolvedTo}`}
              />
            )
          ) : (
            <>
              {loading && <LoadingAgents product={product} selectedModes={form.modes} />}
              {error && (
                <div className="error-card">
                  <CircleHelp size={26} />
                  <div>
                    <strong>
                      {product === 'hotel'
                        ? 'Не получилось найти отели'
                        : 'Не получилось найти варианты'}
                    </strong>
                    <p>{error}</p>
                    <button type="button" onClick={() => searchFormRef.current?.requestSubmit()}>
                      Повторить поиск
                    </button>
                  </div>
                </div>
              )}
              {product === 'transport' && !loading && result && (
                <TransportResultsView
                  result={result}
                  shortlist={shortlist}
                  onToggle={toggleShortlist}
                  onLoadMore={loadMore}
                  loadingMore={loadingMore}
                  loadMoreError={loadMoreError}
                  priority={form.priority}
                  directOnly={form.directOnly}
                  priceMax={form.priceMax}
                  onResetFilters={() =>
                    setForm((current) => ({
                      ...current,
                      priority: null,
                      directOnly: false,
                      priceMax: '',
                    }))
                  }
                  route={`${resolvedFrom} → ${resolvedTo}`}
                />
              )}
              {product === 'hotel' && !loading && hotelResult && (
                <HotelResultsView
                  result={hotelResult}
                  city={hotelResult.meta.resolved_geo?.name || form.destination}
                  checkIn={form.departureDate}
                  checkOut={form.checkoutDate}
                  shortlist={hotelShortlist}
                  onToggle={toggleHotelShortlist}
                  onApplyFilters={applyHotelFilters}
                  filtering={filteringHotels}
                  onLoadMore={loadMoreHotels}
                  loadingMore={loadingMore}
                  loadMoreError={loadMoreError}
                />
              )}
              {!loading && !error && product === 'transport' && !result && (
                <IntroView setForm={setForm} />
              )}
              {!loading && !error && product === 'hotel' && !hotelResult && (
                <HotelIntroView city={form.destination} />
              )}
            </>
          )}
        </div>
      </main>

      {product === 'transport' && shortlist.length > 0 && !showCompare && (
        <div className="compare-dock">
          <div className="compare-dock__stack">
            {shortlist.slice(0, 4).map((offer) => {
              const Icon = modeMeta[offer.transport].icon;
              return (
                <span key={offer.offer_id}>
                  <Icon size={18} />
                </span>
              );
            })}
          </div>
          <div>
            <strong>
              {shortlist.length} {pluralizeVariants(shortlist.length)}
            </strong>
            <small>
              {shortlist.length < 2
                ? 'Добавьте ещё один для сравнения'
                : 'Готовы показать различия'}
            </small>
          </div>
          <button type="button" onClick={openCompare} disabled={shortlist.length < 2}>
            Сравнить
            <ArrowRight size={19} />
          </button>
          <button
            className="compare-dock__clear"
            type="button"
            onClick={() => setShortlist([])}
            aria-label="Очистить"
          >
            <X size={20} />
          </button>
        </div>
      )}

      {product === 'hotel' && hotelShortlist.length > 0 && !showCompare && (
        <div className="compare-dock compare-dock--hotels">
          <div className="compare-dock__stack">
            {hotelShortlist.slice(0, 4).map((hotel) => (
              <span key={hotelKey(hotel)}>
                <Hotel size={18} />
              </span>
            ))}
            {hotelShortlist.length > 4 && (
              <span className="compare-dock__more">+{hotelShortlist.length - 4}</span>
            )}
          </div>
          <div>
            <strong>
              {hotelShortlist.length} {pluralizeHotels(hotelShortlist.length)}
            </strong>
            <small>
              {hotelShortlist.length < 2
                ? 'Добавьте ещё один для сравнения'
                : 'Готовы показать различия'}
            </small>
          </div>
          <button type="button" onClick={openCompare} disabled={hotelShortlist.length < 2}>
            Сравнить <ArrowRight size={19} />
          </button>
          <button
            className="compare-dock__clear"
            type="button"
            onClick={() => setHotelShortlist([])}
            aria-label="Очистить"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingAgents({
  product,
  selectedModes,
}: {
  product: 'transport' | 'hotel';
  selectedModes: TransportMode[];
}) {
  const requestedSources = selectedModes
    .map((mode) => modeMeta[mode].label.toLowerCase())
    .join(', ');
  return (
    <section className="loading-card">
      <span className="loading-card__eyebrow">Идёт поиск</span>
      <h2>{product === 'hotel' ? 'Проверяем доступные отели' : 'Собираем варианты поездки'}</h2>
      <p className="loading-card__lead">
        {product === 'hotel'
          ? 'Сверяем свободные номера, актуальные цены и условия проживания.'
          : `Проверяем ${requestedSources || 'выбранные виды транспорта'} и сравниваем доступные предложения.`}
      </p>
      <div className="loading-steps loading-steps--truthful">
        <div className="is-active">
          <span>
            <Search size={20} />
          </span>
          <p>
            <strong>Проверяем цены и наличие</strong>Результаты появятся здесь сразу после поиска
          </p>
        </div>
      </div>
    </section>
  );
}

function IntroView({ setForm }: { setForm: (value: FormState) => void }) {
  const examples = [
    ['Москва', 'moscow', 'Санкт-Петербург', 'saint-petersburg'],
    ['Москва', 'moscow', 'Казань', 'kazan'],
    ['Санкт-Петербург', 'saint-petersburg', 'Москва', 'moscow'],
  ];
  return (
    <>
      <section className="intro-heading">
        <span className="section-kicker">Новый способ выбирать поездки</span>
        <h2>Не держите варианты в голове</h2>
        <p>
          Добавьте несколько билетов в список — мы соберём различия и честно объясним компромисс.
        </p>
      </section>
      <section className="feature-grid">
        <article>
          <span>
            <GitCompareArrows size={26} />
          </span>
          <h3>Всё на одном экране</h3>
          <p>Цена, время, пересадки, багаж, рейтинг и конкретные точки отправления.</p>
        </article>
        <article>
          <span>
            <Zap size={26} />
          </span>
          <h3>Только различия</h3>
          <p>Скрываем одинаковые параметры и подсвечиваем то, что реально влияет на выбор.</p>
        </article>
        <article>
          <span>
            <Sparkles size={26} />
          </span>
          <h3>Совет без магии</h3>
          <p>Агент рекомендует вариант по вашим приоритетам и показывает главный минус.</p>
        </article>
      </section>
      <section className="examples-card">
        <div>
          <strong>Попробуйте популярный маршрут</strong>
          <small>Дата подставится автоматически</small>
        </div>
        <div className="examples-card__routes">
          {examples.map(([origin, originId, destination, destinationId]) => (
            <button
              key={`${origin}-${destination}`}
              type="button"
              onClick={() =>
                setForm({
                  ...initialForm,
                  origin,
                  originId,
                  destination,
                  destinationId,
                  departureDate: futureDate(7),
                })
              }
            >
              {origin} <ArrowRight size={16} /> {destination}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function HotelIntroView({ city }: { city: string }) {
  return (
    <section className="hotel-intro">
      <span>
        <Hotel size={30} />
      </span>
      <div>
        <span className="section-kicker">Отели и жильё</span>
        <h2>Найдите жильё в городе {city}</h2>
        <p>
          Покажем реальные фотографии, итоговую цену за проживание, отзывы, питание и условия
          отмены.
        </p>
      </div>
    </section>
  );
}

export default App;
