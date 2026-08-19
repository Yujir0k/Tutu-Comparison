import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  BadgeCheck,
  BedDouble,
  BriefcaseBusiness,
  BusFront,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Coffee,
  GitCompareArrows,
  Hotel,
  Luggage,
  MapPin,
  Maximize2,
  MessageSquareText,
  Plane,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  TrainFront,
  TramFront,
  X,
  Zap,
} from "lucide-react";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/Header";
import { DatePicker } from "./components/DatePicker";
import { LocationAutocomplete } from "./components/LocationAutocomplete";
import { PassengerPicker } from "./components/PassengerPicker";
import { isConfirmedLocation, type TravelLocation } from "./locations";
import { recommendOffers, scoreOffers } from './scoring';
import {
  hotelDistanceToCenter,
  hotelMetroInfo,
  rankHotels,
  type HotelPriority,
} from './hotelScoring';
import type {
  Offer,
  HotelDetailsResponse,
  HotelOffer,
  HotelRate,
  HotelSearchPayload,
  HotelSearchResponse,
  Priority,
  SearchPayload,
  SearchResponse,
  TransportMode,
} from "./types";

const modes: Array<{
  id: TransportMode | "all";
  label: string;
  icon: typeof Plane;
}> = [
  { id: "all", label: "Все варианты", icon: GitCompareArrows },
  { id: "avia", label: "Авиабилеты", icon: Plane },
  { id: "railway", label: "Ж/д билеты", icon: TrainFront },
  { id: "bus", label: "Автобусы", icon: BusFront },
  { id: "etrain", label: "Электрички", icon: TramFront },
];

const modeMeta: Record<
  TransportMode,
  { label: string; short: string; icon: typeof Plane; className: string }
> = {
  avia: { label: "Самолёт", short: "Авиа", icon: Plane, className: "avia" },
  railway: { label: "Поезд", short: "Поезд", icon: TrainFront, className: "rail" },
  bus: { label: "Автобус", short: "Автобус", icon: BusFront, className: "bus" },
  etrain: { label: "Электричка", short: "Электричка", icon: TramFront, className: "etrain" },
};

const priorities: Array<{ id: Priority; label: string }> = [
  { id: "balance", label: "Баланс" },
  { id: "price", label: "Дешевле" },
  { id: "time", label: "Быстрее" },
  { id: "calm", label: "Спокойнее" },
];

const hotelPriorities: Array<{ id: HotelPriority; label: string }> = [
  { id: 'balance', label: 'Баланс' },
  { id: 'price', label: 'Дешевле' },
  { id: 'comfort', label: 'Комфорт' },
  { id: 'location', label: 'Ближе к центру' },
  { id: 'flexibility', label: 'Гибкие условия' },
];

const categoryLabels: Record<string, string> = {
  SEDENTARY: "Сидячий",
  RESERVED_SEAT: "Плацкарт",
  COMPARTMENT: "Купе",
  LUX: "СВ",
  SOFT: "Мягкий",
  SHARED: "Общий",
};

const checkoutLinkCache = new Map<string, string>();

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

type HotelSort = 'recommended' | 'price' | 'rating' | 'center';

interface HotelFilterState {
  priceMin: string;
  priceMax: string;
  hotelTypes: string[];
  stars: number[];
  meals: string[];
  minRating?: number;
  centerDistanceMax?: number;
  metroDistanceMax?: number;
  freeCancellation: boolean;
  breakfastIncluded: boolean;
  payAtHotel: boolean;
  hotelAmenities: string[];
  roomAmenities: string[];
}

const initialHotelFilters: HotelFilterState = {
  priceMin: '',
  priceMax: '',
  hotelTypes: [],
  stars: [],
  meals: [],
  freeCancellation: false,
  breakfastIncluded: false,
  payAtHotel: false,
  hotelAmenities: [],
  roomAmenities: [],
};

const hotelTypeOptions = [
  ['hotel', 'Отели'],
  ['apartments', 'Квартиры'],
  ['aparthotel', 'Апарт-отели'],
  ['guesthouse', 'Гостевые дома'],
  ['hostel', 'Хостелы'],
  ['cottage', 'Коттеджи и дома'],
] as const;

const hotelMealOptions = [
  ['breakfast', 'Завтрак'],
  ['halfboard', 'Завтрак + обед или ужин'],
  ['fullboard', 'Завтрак, обед и ужин'],
  ['allinclusive', 'Всё включено'],
  ['nomeal', 'Питание не включено'],
] as const;

const hotelAmenityOptions = [
  ['pool', 'Бассейн'],
  ['parking', 'Парковка'],
  ['wifi', 'Wi-Fi'],
  ['spa', 'Спа'],
  ['pet_friendly', 'Можно с животными'],
  ['kitchen', 'Кухня'],
  ['fitness', 'Тренажёрный зал'],
  ['beach', 'Пляж'],
] as const;

const roomAmenityOptions = [
  ['private_bath', 'Собственная ванная'],
  ['workspace', 'Рабочее место'],
  ['room_kitchen', 'Кухня в номере'],
  ['room_wifi', 'Wi-Fi в номере'],
  ['air_conditioner', 'Кондиционер'],
  ['balcony', 'Балкон'],
] as const;

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
  origin: "Москва",
  originId: "moscow",
  destination: "Санкт-Петербург",
  destinationId: "saint-petersburg",
  departureDate: futureDate(7),
  checkoutDate: futureDate(9),
  adults: 1,
  childrenAges: [],
  priceMax: "",
  directOnly: false,
  priority: "balance",
  modes: ["avia", "railway", "bus", "etrain"],
};

function formatMoney(amount: number, currency = "RUB") {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 ? 2 : 0,
  }).format(amount);
}

function formatTime(value?: string) {
  if (!value) return "—";
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1] || "—";
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(
    new Date(value),
  );
}

function formatTripDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(new Date(value));
}

function placeParts(value?: string) {
  if (!value) return { city: "Не указано", terminal: "Точка отправления не указана" };
  const clean = value.replace(/\s*\(\d{5,}\)\s*$/, "");
  const [city, ...terminalParts] = clean.split(" — ");
  if (!terminalParts.length) return { city: "", terminal: clean };
  return {
    city: city || clean,
    terminal: terminalParts.join(" — ") || clean,
  };
}

function baggageLabel(offer: Offer) {
  if (offer.transport !== 'avia') return null;
  const baggage = offer.variants?.[0]?.conditions?.baggage;
  if (!baggage) return null;
  if (!baggage.kg && !baggage.pieces) return 'Без багажа';
  if (baggage.kg) return `Багаж ${baggage.kg} кг${baggage.pieces ? ` · ${baggage.pieces} место` : ''}`;
  return `Багаж · ${baggage.pieces} место`;
}

function cabinBaggageLabel(offer: Offer) {
  if (offer.transport !== "avia") return null;
  const baggage = offer.variants?.[0]?.conditions?.cabin_baggage;
  if (!baggage) return null;
  const parts = [
    baggage.kg ? `${baggage.kg} кг` : null,
    baggage.pieces ? `${baggage.pieces} место` : null,
    baggage.dimensions || null,
  ].filter(Boolean);
  return parts.length ? `Ручная кладь · ${parts.join(" · ")}` : "Ручная кладь включена";
}

function baggageUpgradeLabel(offer: Offer) {
  if (offer.transport !== "avia") return null;
  const upgrade = offer.variants?.find((variant) => {
    const baggage = variant.conditions?.baggage;
    return Boolean(variant.price && (baggage?.kg || baggage?.pieces) && variant.price.amount > offer.price.amount);
  });
  const baggage = upgrade?.conditions?.baggage;
  if (!upgrade?.price || !baggage) return null;
  const size = baggage.kg ? `${baggage.kg} кг` : `${baggage.pieces} место`;
  return `Багаж ${size} от +${formatMoney(upgrade.price.amount - offer.price.amount, upgrade.price.currency)}`;
}

function offerFallbackUrl(offer: Offer) {
  return offer.checkout_url || offer.search_results_url || null;
}

function CheckoutButton({
  offer,
  label,
  className,
}: {
  offer: Offer;
  label: string;
  className?: string;
}) {
  const [opening, setOpening] = useState(false);
  const fallbackUrl = offerFallbackUrl(offer);
  const hasCheckoutTarget = Boolean(offer.checkout_ref || fallbackUrl);

  const openCheckout = async () => {
    const cached = checkoutLinkCache.get(offer.offer_id);
    if (cached) {
      window.open(cached, "_blank", "noopener,noreferrer");
      return;
    }

    if (!offer.checkout_ref) {
      if (fallbackUrl) window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const popup = window.open("about:blank", "_blank");
    if (popup) {
      popup.opener = null;
      popup.document.title = "Открываем выбранный вариант на Туту";
      popup.document.body.textContent = "Открываем выбранный вариант на Туту…";
    }
    setOpening(true);

    try {
      const response = await fetch("/api/checkout-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checkoutRef: offer.checkout_ref }),
      });
      const data = (await response.json()) as { checkout_url?: string; error?: string };
      if (!response.ok || !data.checkout_url) throw new Error(data.error || "Не удалось получить ссылку");
      checkoutLinkCache.set(offer.offer_id, data.checkout_url);
      if (popup) popup.location.href = data.checkout_url;
      else window.location.href = data.checkout_url;
    } catch {
      if (fallbackUrl) {
        if (popup) popup.location.href = fallbackUrl;
        else window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      } else if (popup) {
        popup.close();
      }
    } finally {
      setOpening(false);
    }
  };

  return (
    <button className={className} type="button" disabled={opening || !hasCheckoutTarget} onClick={openCheckout}>
      {opening ? "Открываем…" : hasCheckoutTarget ? label : "Переход недоступен"} <ChevronRight size={17} />
    </button>
  );
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours ? `${hours} ч` : ""}${rest ? ` ${rest} мин` : ""}`.trim();
}

function pluralizeVariants(count: number) {
  const last = count % 10;
  const lastTwo = count % 100;
  if (last === 1 && lastTwo !== 11) return "вариант";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "варианта";
  return "вариантов";
}

function pluralizeReviews(count: number) {
  const last = count % 10;
  const lastTwo = count % 100;
  if (last === 1 && lastTwo !== 11) return "отзыв";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "отзыва";
  return "отзывов";
}

function pluralizeHotels(count: number) {
  const last = count % 10;
  const lastTwo = count % 100;
  if (last === 1 && lastTwo !== 11) return 'отель';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'отеля';
  return 'отелей';
}

function hotelKey(hotel: HotelOffer) {
  return String(hotel.tutu_offer_id || hotel.hotel_id || hotel.hotel_geo_id || hotel.name);
}

function hotelGuestRating(hotel: { rating?: number; review_summary?: { rating?: number } }) {
  const rating = hotel.review_summary?.rating ?? hotel.rating;
  return typeof rating === 'number' && Number.isFinite(rating) && rating > 0 ? rating : undefined;
}

function hotelPhotoUrl(photo: NonNullable<HotelOffer["photos"]>[number]) {
  if (typeof photo === "string") return photo;
  return photo?.large_url || photo?.original_url || photo?.url || photo?.src || "";
}

function hotelHighlightText(highlight: string | { text?: string }) {
  return typeof highlight === 'string' ? highlight : highlight.text || '';
}

function hotelAmenityName(amenity: string | { name: string }) {
  return typeof amenity === 'string' ? amenity : amenity.name;
}

function formatCancellationDeadline(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(date);
}

function nightsBetween(checkIn: string, checkOut: string) {
  const start = new Date(`${checkIn}T12:00:00`).getTime();
  const end = new Date(`${checkOut}T12:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function firstSegment(offer: Offer) {
  return offer.legs?.[0]?.segments?.[0];
}

function lastSegment(offer: Offer) {
  const leg = offer.legs?.[offer.legs.length - 1];
  return leg?.segments?.[leg.segments.length - 1];
}

function refundValue(offer: Offer) {
  if (offer.transport === "railway") {
    if (offer.fares?.refundable_count) return "Есть возвратные тарифы";
    if (offer.fares?.refundable_unknown) return "Не удалось проверить";
    return offer.fares?.refundable_count === 0 ? "Подтверждённо возвратных нет" : "Неизвестно";
  }
  if (offer.transport === "avia") {
    const values = offer.variants?.map((variant) => variant.conditions?.refundable);
    if (values?.some(Boolean)) return "Есть возвратный тариф";
    if (values?.some((value) => value === false)) return "Есть подтверждённо невозвратный тариф";
  }
  return "Туту не вернул это поле";
}

function baggageValue(offer: Offer) {
  if (offer.transport !== "avia") return "Не применяется";
  const baggage = offer.variants?.[0]?.conditions?.baggage;
  if (!baggage) return "Туту не вернул это поле";
  if (baggage.pieces === 0 || baggage.kg === 0) return "Без багажа";
  const pieces = baggage.pieces ? `${baggage.pieces} место` : "";
  const kg = baggage.kg ? `${baggage.kg} кг` : "";
  return [pieces, kg].filter(Boolean).join(" · ") || "Условия не указаны";
}

function ratingValue(offer: Offer) {
  const rating = offer.review_summary?.rating;
  if (rating === undefined) return "Нет данных";
  const count = offer.review_summary?.review_count;
  return `${rating}/10${count ? ` · ${count.toLocaleString("ru-RU")} отзывов` : ""}`;
}

function seatCategories(offer: Offer) {
  const values = Object.keys(offer.fares?.seat_categories || {}).map(
    (value) => categoryLabels[value] || value,
  );
  if (values.length) return values.join(", ");
  return offer.transport === 'railway' ? 'Туту не вернул это поле' : 'Не применяется';
}

function hotelRatingLabel(rating: number) {
  if (rating >= 9) return 'Превосходно';
  if (rating >= 8) return 'Очень хорошо';
  if (rating >= 7) return 'Хорошо';
  if (rating >= 6) return 'Неплохо';
  return 'Низкая оценка';
}

function rankOffers(offers: Offer[], priority: Priority) {
  const sorted = [...offers];
  if (priority === 'price') sorted.sort((a, b) => (
    a.price.amount - b.price.amount
    || a.analysis.stressScore - b.analysis.stressScore
    || a.duration_min - b.duration_min
    || b.analysis.confidence - a.analysis.confidence
  ));
  if (priority === 'time') sorted.sort((a, b) => (
    a.duration_min - b.duration_min
    || a.analysis.changes - b.analysis.changes
    || a.price.amount - b.price.amount
    || b.analysis.confidence - a.analysis.confidence
  ));
  if (priority === 'calm') sorted.sort((a, b) => (
    a.analysis.stressScore - b.analysis.stressScore
    || a.analysis.changes - b.analysis.changes
    || a.duration_min - b.duration_min
    || a.price.amount - b.price.amount
  ));
  if (priority === 'balance') sorted.sort((a, b) => (
    b.analysis.routeScore - a.analysis.routeScore
    || b.analysis.confidence - a.analysis.confidence
    || a.price.amount - b.price.amount
    || a.duration_min - b.duration_min
  ));
  return sorted;
}

function buildCuratorVerdict(leader: Offer, offers: Offer[], priority: Priority) {
  const ranked = rankOffers(offers, priority);
  const runner = ranked.find((offer) => offer.offer_id !== leader.offer_id);
  const cheapest = [...offers].sort((a, b) => a.price.amount - b.price.amount)[0];
  const fastest = [...offers].sort((a, b) => a.duration_min - b.duration_min)[0];
  const calmest = [...offers].sort((a, b) => a.analysis.stressScore - b.analysis.stressScore)[0];
  const strengths: string[] = [];
  let summary = 'Этот вариант лучше соответствует выбранному приоритету.';

  if (priority === "balance") {
    summary = `Лучшее сочетание цены, времени и спокойствия из ${offers.length} вариантов.`;
    strengths.push(`Индекс баланса ${leader.analysis.routeScore}/100`);
  }
  if (priority === "price") {
    summary = `Самая низкая цена в списке — ${formatMoney(leader.price.amount, leader.price.currency)}.`;
    if (runner && runner.price.amount > leader.price.amount) {
      strengths.push(`Экономия ${formatMoney(runner.price.amount - leader.price.amount, leader.price.currency)} к следующему по цене`);
    }
  }
  if (priority === "time") {
    summary = `Самый короткий путь — ${formatDuration(leader.duration_min)}.`;
    if (runner && runner.duration_min > leader.duration_min) {
      strengths.push(`Быстрее следующего варианта на ${formatDuration(runner.duration_min - leader.duration_min)}`);
    }
  }
  if (priority === "calm") {
    summary = `Минимальная нагрузка поездки — ${leader.analysis.stressScore}/100.`;
    if (runner && runner.analysis.stressScore > leader.analysis.stressScore) {
      strengths.push(`На ${runner.analysis.stressScore - leader.analysis.stressScore} пунктов спокойнее следующего варианта`);
    }
  }

  if (leader.analysis.changes === 0) strengths.push('Без пересадок');
  else strengths.push(`${leader.analysis.changes} ${leader.analysis.changes === 1 ? "пересадка" : "пересадки"}`);
  if (!leader.analysis.overnight) strengths.push('Не затрагивает поздние и ранние часы');
  if (leader.review_summary?.rating && leader.review_summary.rating >= 9) {
    strengths.push(`Рейтинг ${leader.review_summary.rating}/10`);
  }

  const priceGap = leader.price.amount - cheapest.price.amount;
  const timeGap = leader.duration_min - fastest.duration_min;
  const stressGap = leader.analysis.stressScore - calmest.analysis.stressScore;
  const tradeoffs: Array<{ dimension: 'price' | 'time' | 'calm'; severity: number; text: string }> = [];
  if (priceGap > Math.max(200, cheapest.price.amount * 0.04)) {
    tradeoffs.push({
      dimension: 'price',
      severity: priceGap / Math.max(1, cheapest.price.amount),
      text: `дороже самого дешёвого варианта на ${formatMoney(priceGap, leader.price.currency)} (${Math.round(priceGap / cheapest.price.amount * 100)}%).`,
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

  const relevantTradeoffs = tradeoffs.filter((item) => (
    (priority === 'price' && item.dimension !== 'price')
    || (priority === 'time' && item.dimension !== 'time')
    || (priority === 'calm' && item.dimension !== 'calm')
    || priority === 'balance'
  ));
  const tradeoff = relevantTradeoffs.sort((left, right) => right.severity - left.severity)[0]?.text
    || 'существенного подтверждённого компромисса среди выбранных вариантов нет.';

  return { summary, strengths: strengths.slice(0, 3), tradeoff };
}

function App() {
  const [product, setProduct] = useState<"transport" | "hotel">("transport");
  const [form, setForm] = useState<FormState>(initialForm);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [hotelResult, setHotelResult] = useState<HotelSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filteringHotels, setFilteringHotels] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [error, setError] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const [onlyDifferences, setOnlyDifferences] = useState(true);
  const [comparePriority, setComparePriority] = useState<Priority>("balance");
  const [shortlist, setShortlist] = useState<Offer[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("tutu-compare-list") || "[]") as Offer[];
    } catch {
      return [];
    }
  });
  const [hotelShortlist, setHotelShortlist] = useState<HotelOffer[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("tutu-hotel-compare-list") || "[]") as HotelOffer[];
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
    localStorage.setItem("tutu-compare-list", JSON.stringify(shortlist));
  }, [shortlist]);

  useEffect(() => {
    localStorage.setItem("tutu-hotel-compare-list", JSON.stringify(hotelShortlist));
  }, [hotelShortlist]);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    const originId = form.originId;
    const destinationId = form.destinationId;

    if (product === "hotel") {
      if (!destinationId || !isConfirmedLocation(destinationId, form.destination)) {
        setHotelResult(null);
        setError("Выберите город или курорт из выпадающего списка");
        return;
      }
      if (form.checkoutDate <= form.departureDate) {
        setHotelResult(null);
        setError("Дата выезда должна быть позже даты заезда");
        return;
      }

      setLoading(true);
      setError("");
      setLoadMoreError("");
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
        const response = await fetch("/api/hotels", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await response.json()) as HotelSearchResponse & { error?: string };
        if (!response.ok) throw new Error(data.error || "Не удалось найти отели");
        setHotelResult(data);
        lastHotelSearchRef.current = payload;
        window.setTimeout(() => contentRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
      } catch (searchError) {
        setError(searchError instanceof Error ? searchError.message : "Не удалось найти отели");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!originId || !isConfirmedLocation(originId, form.origin)) {
      setResult(null);
      setError("Выберите город отправления из выпадающего списка");
      return;
    }
    if (!destinationId || !isConfirmedLocation(destinationId, form.destination)) {
      setResult(null);
      setError("Выберите город прибытия из выпадающего списка");
      return;
    }
    if (originId === destinationId) {
      setResult(null);
      setError("Города отправления и прибытия должны отличаться");
      return;
    }

    setLoading(true);
    setError("");
    setLoadMoreError("");
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
      priority: "balance",
      priceMax: undefined,
      directOnly: false,
      modes: form.modes,
      page: 1,
    };

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as SearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось выполнить поиск");
      setResult(data);
      lastSearchRef.current = payload;
      window.setTimeout(() => contentRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Что-то пошло не так");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!result?.meta.has_more || loadingMore || !lastSearchRef.current) return;
    setLoadingMore(true);
    setLoadMoreError("");
    const nextPage = (result.meta.page || 1) + 1;
    const modesWithMore = Object.entries(result.meta.mode_pagination || {})
      .filter(([, pagination]) => pagination?.has_more)
      .map(([mode]) => mode as TransportMode);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...lastSearchRef.current,
          modes: modesWithMore.length ? modesWithMore : lastSearchRef.current.modes,
          page: nextPage,
        }),
      });
      const data = (await response.json()) as SearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить следующую страницу");

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
      setLoadMoreError(loadError instanceof Error ? loadError.message : "Не удалось загрузить варианты");
    } finally {
      setLoadingMore(false);
    }
  };

  const loadMoreHotels = async () => {
    if (!hotelResult?.meta.has_more || loadingMore || !lastHotelSearchRef.current) return;
    setLoadingMore(true);
    setLoadMoreError("");
    const nextPage = (hotelResult.meta.page || 1) + 1;

    try {
      const response = await fetch("/api/hotels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...lastHotelSearchRef.current, page: nextPage }),
      });
      const data = (await response.json()) as HotelSearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить ещё отели");
      setHotelResult((current) => {
        if (!current) return data;
        const known = new Set(current.hotels.map(hotelKey));
        const hotels = [...current.hotels, ...data.hotels.filter((hotel) => !known.has(hotelKey(hotel)))];
        return {
          ...data,
          hotels,
          meta: { ...data.meta, total_returned: hotels.length },
        };
      });
    } catch (loadError) {
      setLoadMoreError(loadError instanceof Error ? loadError.message : "Не удалось загрузить ещё отели");
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
      setLoadMoreError(filterError instanceof Error ? filterError.message : 'Не удалось применить фильтры');
    } finally {
      if (requestId === hotelFilterRequestRef.current) setFilteringHotels(false);
    }
  };

  const toggleMode = (mode: TransportMode | "all") => {
    setProduct("transport");
    setShowCompare(false);
    setError("");
    if (mode === "all") {
      setForm((current) => ({
        ...current,
        modes:
          current.modes.length === 4
            ? []
            : ["avia", "railway", "bus", "etrain"],
      }));
      return;
    }
    setForm((current) => {
      const exists = current.modes.includes(mode);
      return {
        ...current,
        modes: exists
          ? current.modes.filter((item) => item !== mode)
          : [...current.modes, mode],
      };
    });
  };

  const updateLocationInput = (field: "origin" | "destination", value: string) => {
    const idField = field === "origin" ? "originId" : "destinationId";
    setForm((current) => ({ ...current, [field]: value, [idField]: undefined }));
    setResult(null);
    setHotelResult(null);
    lastSearchRef.current = null;
    lastHotelSearchRef.current = null;
    setError("");
    setShowCompare(false);
    setShortlist([]);
  };

  const selectLocation = (field: "origin" | "destination", location: TravelLocation) => {
    const idField = field === "origin" ? "originId" : "destinationId";
    setForm((current) => ({ ...current, [field]: location.name, [idField]: location.id }));
    setError("");
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
    window.setTimeout(() => contentRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
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
  const activeCompareCount = product === "hotel" ? hotelShortlist.length : shortlist.length;

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
                <span><ShieldCheck size={18} /> Только реальные варианты Туту</span>
                <span><GitCompareArrows size={18} /> Все различия на одном экране</span>
              </div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="hero-art__orbit" />
              <GitCompareArrows size={70} />
              <span>vs</span>
            </div>
          </div>

          <div className="product-tabs product-tabs--main" role="group" aria-label="Категории поиска">
            {modes.map((mode) => {
              const Icon = mode.icon;
              const active = product === 'transport' && (mode.id === 'all'
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
                  <span><Icon size={29} strokeWidth={2.4} /></span>
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
              <span><Hotel size={29} strokeWidth={2.4} /></span>
              Отели
            </button>
          </div>

          <form ref={searchFormRef} className={`search-form ${product === "hotel" ? "search-form--hotel" : ""}`} onSubmit={handleSearch}>
            {product === "transport" ? (
              <>
                <LocationAutocomplete
                  className="search-field--from"
                  label="Откуда"
                  value={form.origin}
                  selectedId={form.originId}
                  excludeId={form.destinationId}
                  onInput={(value) => updateLocationInput("origin", value)}
                  onSelect={(location) => selectLocation("origin", location)}
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
                  onInput={(value) => updateLocationInput("destination", value)}
                  onSelect={(location) => selectLocation("destination", location)}
                />
                <DatePicker
                  value={form.departureDate}
                  min={futureDate(1)}
                  onChange={(departureDate) => setForm((current) => ({ ...current, departureDate }))}
                />
              </>
            ) : (
              <>
                <LocationAutocomplete
                  className="search-field--hotel-city"
                  label="Город или курорт"
                  value={form.destination}
                  selectedId={form.destinationId}
                  onInput={(value) => updateLocationInput("destination", value)}
                  onSelect={(location) => selectLocation("destination", location)}
                />
                <DatePicker
                  label="Заезд"
                  value={form.departureDate}
                  min={futureDate(1)}
                  onChange={(departureDate) => setForm((current) => ({
                    ...current,
                    departureDate,
                    checkoutDate: current.checkoutDate <= departureDate ? addDaysIso(departureDate, 2) : current.checkoutDate,
                  }))}
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
              onChildrenAgesChange={(childrenAges) => setForm((current) => ({ ...current, childrenAges }))}
            />
            <button
              className="search-button"
              type="submit"
              disabled={loading || (product === "transport" ? form.modes.length === 0 || !locationsReady : !hotelLocationReady)}
              title={product === "transport" && form.modes.length === 0 ? "Выберите хотя бы один вид транспорта" : undefined}
            >
              {loading
                ? "Ищем…"
                : product === "hotel"
                  ? hotelLocationReady ? "Найти отели" : "Выберите город"
                  : form.modes.length === 0
                    ? "Выберите транспорт"
                    : !locationsReady
                      ? "Выберите город"
                      : "Найти варианты"}
            </button>
          </form>

          {product === "transport" && <div className="quick-filters">
            <span>Что важнее:</span>
            {priorities.map((priority) => (
              <button
                className={form.priority === priority.id ? "is-active" : ""}
                key={priority.id}
                type="button"
                aria-pressed={form.priority === priority.id}
                onClick={() => setForm((current) => ({
                  ...current,
                  priority: current.priority === priority.id ? null : priority.id,
                }))}
              >
                {priority.label}
              </button>
            ))}
            <label className={form.directOnly ? "is-active" : ""}>
              <input
                type="checkbox"
                checked={form.directOnly}
                onChange={(event) => setForm({ ...form, directOnly: event.target.checked })}
              />
              Без пересадок
            </label>
            <div className={`budget-filter ${form.priceMax ? "is-active" : ""}`}>
              До
              <input
                aria-label="До ₽"
                inputMode="numeric"
                placeholder="любой цены"
                value={form.priceMax}
                onChange={(event) => setForm({ ...form, priceMax: event.target.value.replace(/\D/g, "") })}
              />
              ₽
              {form.priceMax && (
                <button
                  className="budget-filter__clear"
                  type="button"
                  aria-label="Сбросить максимальную цену"
                  onClick={() => setForm((current) => ({ ...current, priceMax: "" }))}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>}
        </div>
      </section>

      <main className="content" ref={contentRef}>
        <div className="content__inner">
          {showCompare ? (
            product === "hotel" ? (
              <HotelComparisonView
                hotels={hotelShortlist}
                checkIn={form.departureDate}
                checkOut={form.checkoutDate}
                guests={form.adults + form.childrenAges.length}
                onRemove={toggleHotelShortlist}
                onBack={() => setShowCompare(false)}
              />
            ) : (
              <ComparisonView
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
                    <strong>{product === "hotel" ? "Не получилось найти отели" : "Не получилось найти варианты"}</strong>
                    <p>{error}</p>
                    <button type="button" onClick={() => searchFormRef.current?.requestSubmit()}>Повторить поиск</button>
                  </div>
                </div>
              )}
              {product === "transport" && !loading && result && (
                <ResultsView
                  result={result}
                  shortlist={shortlist}
                  onToggle={toggleShortlist}
                  onLoadMore={loadMore}
                  loadingMore={loadingMore}
                  loadMoreError={loadMoreError}
                  priority={form.priority}
                  directOnly={form.directOnly}
                  priceMax={form.priceMax}
                  onResetFilters={() => setForm((current) => ({
                    ...current,
                    priority: null,
                    directOnly: false,
                    priceMax: "",
                  }))}
                  route={`${resolvedFrom} → ${resolvedTo}`}
                />
              )}
              {product === "hotel" && !loading && hotelResult && (
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
              {!loading && !error && product === "transport" && !result && <IntroView setForm={setForm} />}
              {!loading && !error && product === "hotel" && !hotelResult && <HotelIntroView city={form.destination} />}
            </>
          )}
        </div>
      </main>

      {product === "transport" && shortlist.length > 0 && !showCompare && (
        <div className="compare-dock">
          <div className="compare-dock__stack">
            {shortlist.slice(0, 4).map((offer) => {
              const Icon = modeMeta[offer.transport].icon;
              return <span key={offer.offer_id}><Icon size={18} /></span>;
            })}
          </div>
          <div>
            <strong>{shortlist.length} {pluralizeVariants(shortlist.length)}</strong>
            <small>{shortlist.length < 2 ? "Добавьте ещё один для сравнения" : "Готовы показать различия"}</small>
          </div>
          <button type="button" onClick={openCompare} disabled={shortlist.length < 2}>
            Сравнить
            <ArrowRight size={19} />
          </button>
          <button className="compare-dock__clear" type="button" onClick={() => setShortlist([])} aria-label="Очистить">
            <X size={20} />
          </button>
        </div>
      )}

      {product === "hotel" && hotelShortlist.length > 0 && !showCompare && (
        <div className="compare-dock compare-dock--hotels">
          <div className="compare-dock__stack">
            {hotelShortlist.slice(0, 4).map((hotel) => (
              <span key={hotelKey(hotel)}><Hotel size={18} /></span>
            ))}
            {hotelShortlist.length > 4 && <span className="compare-dock__more">+{hotelShortlist.length - 4}</span>}
          </div>
          <div>
            <strong>{hotelShortlist.length} {pluralizeHotels(hotelShortlist.length)}</strong>
            <small>{hotelShortlist.length < 2 ? "Добавьте ещё один для сравнения" : "Готовы показать различия"}</small>
          </div>
          <button type="button" onClick={openCompare} disabled={hotelShortlist.length < 2}>
            Сравнить <ArrowRight size={19} />
          </button>
          <button className="compare-dock__clear" type="button" onClick={() => setHotelShortlist([])} aria-label="Очистить">
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingAgents({ product, selectedModes }: { product: "transport" | "hotel"; selectedModes: TransportMode[] }) {
  const requestedSources = selectedModes.map((mode) => modeMeta[mode].label.toLowerCase()).join(', ');
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
          <span><Search size={20} /></span>
          <p><strong>Проверяем цены и наличие</strong>Результаты появятся здесь сразу после поиска</p>
        </div>
      </div>
    </section>
  );
}

function IntroView({ setForm }: { setForm: (value: FormState) => void }) {
  const examples = [
    ["Москва", "moscow", "Санкт-Петербург", "saint-petersburg"],
    ["Москва", "moscow", "Казань", "kazan"],
    ["Санкт-Петербург", "saint-petersburg", "Москва", "moscow"],
  ];
  return (
    <>
      <section className="intro-heading">
        <span className="section-kicker">Новый способ выбирать поездки</span>
        <h2>Не держите варианты в голове</h2>
        <p>Добавьте несколько билетов в список — мы соберём различия и честно объясним компромисс.</p>
      </section>
      <section className="feature-grid">
        <article>
          <span><GitCompareArrows size={26} /></span>
          <h3>Всё на одном экране</h3>
          <p>Цена, время, пересадки, багаж, рейтинг и конкретные точки отправления.</p>
        </article>
        <article>
          <span><Zap size={26} /></span>
          <h3>Только различия</h3>
          <p>Скрываем одинаковые параметры и подсвечиваем то, что реально влияет на выбор.</p>
        </article>
        <article>
          <span><Sparkles size={26} /></span>
          <h3>Совет без магии</h3>
          <p>Агент рекомендует вариант по вашим приоритетам и показывает главный минус.</p>
        </article>
      </section>
      <section className="examples-card">
        <div><strong>Попробуйте популярный маршрут</strong><small>Дата подставится автоматически</small></div>
        <div className="examples-card__routes">
          {examples.map(([origin, originId, destination, destinationId]) => (
            <button
              key={`${origin}-${destination}`}
              type="button"
              onClick={() => setForm({ ...initialForm, origin, originId, destination, destinationId, departureDate: futureDate(7) })}
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
      <span><Hotel size={30} /></span>
      <div>
        <span className="section-kicker">Отели и жильё</span>
        <h2>Найдите жильё в городе {city}</h2>
        <p>Покажем реальные фотографии, итоговую цену за проживание, отзывы, питание и условия отмены.</p>
      </div>
    </section>
  );
}

function HotelResultsView({
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

  const activeFilterCount = filters.hotelTypes.length
    + filters.stars.length
    + filters.meals.length
    + filters.hotelAmenities.length
    + filters.roomAmenities.length
    + (filters.priceMin ? 1 : 0)
    + (filters.priceMax ? 1 : 0)
    + (filters.minRating ? 1 : 0)
    + (filters.centerDistanceMax ? 1 : 0)
    + (filters.metroDistanceMax ? 1 : 0)
    + (filters.freeCancellation ? 1 : 0)
    + (filters.breakfastIncluded ? 1 : 0)
    + (filters.payAtHotel ? 1 : 0);

  const toggleStringFilter = (field: 'hotelTypes' | 'meals' | 'hotelAmenities' | 'roomAmenities', value: string) => {
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
      if (minimumPrice !== undefined && (!pricePerNight || pricePerNight < minimumPrice)) return false;
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
      if (sort === 'price') return (left.best_offer?.price?.amount || Infinity) - (right.best_offer?.price?.amount || Infinity);
      if (sort === 'rating') return (hotelGuestRating(right) ?? -1) - (hotelGuestRating(left) ?? -1);
      if (sort === 'center') return (hotelDistanceToCenter(left) ?? Infinity) - (hotelDistanceToCenter(right) ?? Infinity);
      return 0;
    });
  }, [filters.centerDistanceMax, filters.metroDistanceMax, filters.payAtHotel, filters.priceMin, nights, result.hotels, sort]);

  return (
    <section className="hotel-results">
      <div className="results-heading">
        <div>
          <span className="section-kicker">Цены и наличие обновлены</span>
          <h2>Отели в городе {city}</h2>
          <p>{formatDate(checkIn)} — {formatDate(checkOut)} · {nights} {nights === 1 ? "ночь" : nights < 5 ? "ночи" : "ночей"} · найдено {result.hotels.length}</p>
        </div>
      </div>

      {result.meta.is_cached && (
        <div className="notice-card">Показываем последние доступные результаты. Итоговая цена подтвердится перед бронированием.</div>
      )}

      <div className="hotel-results-layout">
        <aside className={`hotel-filters ${filtersOpen ? 'is-open' : ''}`} aria-label="Фильтры отелей">
          <div className="hotel-filters__heading">
            <button className="hotel-filters__mobile-toggle" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((current) => !current)}>
              <strong>Фильтры</strong>
              {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
              <ChevronRight size={20} aria-hidden="true" />
            </button>
            {activeFilterCount > 0 && <button className="hotel-filters__reset" type="button" onClick={() => setFilters(initialHotelFilters)}>Сбросить</button>}
          </div>

          <div className="hotel-filters__body">
            <section>
            <h3>Популярные фильтры</h3>
            <label><input type="checkbox" checked={filters.hotelTypes.includes('hotel')} onChange={() => toggleStringFilter('hotelTypes', 'hotel')} /> Отели</label>
            <label><input type="checkbox" checked={filters.hotelTypes.includes('apartments')} onChange={() => toggleStringFilter('hotelTypes', 'apartments')} /> Квартиры</label>
            <label><input type="checkbox" checked={filters.breakfastIncluded} onChange={(event) => setFilters((current) => ({ ...current, breakfastIncluded: event.target.checked }))} /> Завтрак включён</label>
            <label><input type="checkbox" checked={filters.freeCancellation} onChange={(event) => setFilters((current) => ({ ...current, freeCancellation: event.target.checked }))} /> Бесплатная отмена</label>
            <label><input type="checkbox" checked={[3, 4, 5].every((star) => filters.stars.includes(star))} onChange={(event) => setFilters((current) => ({ ...current, stars: event.target.checked ? Array.from(new Set([...current.stars, 3, 4, 5])) : current.stars.filter((star) => star < 3) }))} /> От 3 звёзд</label>
          </section>

          <section>
            <h3>Цена за ночь</h3>
            <div className="hotel-filter-price">
              <label><span>От</span><input inputMode="numeric" placeholder="0 ₽" value={filters.priceMin} onChange={(event) => setFilters((current) => ({ ...current, priceMin: event.target.value.replace(/\D/g, '') }))} /></label>
              <label><span>До</span><input inputMode="numeric" placeholder="Любая" value={filters.priceMax} onChange={(event) => setFilters((current) => ({ ...current, priceMax: event.target.value.replace(/\D/g, '') }))} /></label>
            </div>
          </section>

          <section>
            <h3>Размещение</h3>
            {hotelTypeOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={filters.hotelTypes.includes(value)} onChange={() => toggleStringFilter('hotelTypes', value)} /> {label}</label>)}
          </section>

          <section>
            <h3>Количество звёзд</h3>
            {[5, 4, 3, 2, 1, 0].map((star) => (
              <label key={star}><input type="checkbox" checked={filters.stars.includes(star)} onChange={() => setFilters((current) => ({ ...current, stars: current.stars.includes(star) ? current.stars.filter((item) => item !== star) : [...current.stars, star] }))} /> {star ? '★'.repeat(star) : 'Без звёзд'}</label>
            ))}
          </section>

          <section>
            <h3>Питание</h3>
            {hotelMealOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={filters.meals.includes(value)} onChange={() => toggleStringFilter('meals', value)} /> {label}</label>)}
          </section>

          <section>
            <h3>Рейтинг отелей</h3>
            {[9, 8, 7].map((rating) => <label key={rating}><input type="radio" name="hotel-rating" checked={filters.minRating === rating} onChange={() => setFilters((current) => ({ ...current, minRating: rating }))} /> Выше {rating}</label>)}
            <label><input type="radio" name="hotel-rating" checked={filters.minRating === undefined} onChange={() => setFilters((current) => ({ ...current, minRating: undefined }))} /> Любой рейтинг</label>
          </section>

          <section>
            <h3>До центра</h3>
            {[1, 3, 5].map((distance) => <label key={distance}><input type="radio" name="hotel-center" checked={filters.centerDistanceMax === distance} onChange={() => setFilters((current) => ({ ...current, centerDistanceMax: distance }))} /> {distance} км</label>)}
            <label><input type="radio" name="hotel-center" checked={filters.centerDistanceMax === undefined} onChange={() => setFilters((current) => ({ ...current, centerDistanceMax: undefined }))} /> Любое расстояние</label>
          </section>

          <section>
            <h3>До метро</h3>
            {[[500, '500 м'], [1000, '1 км'], [2000, '2 км']].map(([distance, label]) => <label key={distance}><input type="radio" name="hotel-metro" checked={filters.metroDistanceMax === distance} onChange={() => setFilters((current) => ({ ...current, metroDistanceMax: Number(distance) }))} /> {label}</label>)}
            <label><input type="radio" name="hotel-metro" checked={filters.metroDistanceMax === undefined} onChange={() => setFilters((current) => ({ ...current, metroDistanceMax: undefined }))} /> Любое расстояние</label>
          </section>

          <section>
            <h3>Удобства и услуги</h3>
            {hotelAmenityOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={filters.hotelAmenities.includes(value)} onChange={() => toggleStringFilter('hotelAmenities', value)} /> {label}</label>)}
          </section>

          <section>
            <h3>Удобства в номере</h3>
            {roomAmenityOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={filters.roomAmenities.includes(value)} onChange={() => toggleStringFilter('roomAmenities', value)} /> {label}</label>)}
          </section>

            <section>
              <h3>Оплата</h3>
              <label><input type="checkbox" checked={filters.payAtHotel} onChange={(event) => setFilters((current) => ({ ...current, payAtHotel: event.target.checked }))} /> Оплата при заселении</label>
            </section>
          </div>
        </aside>

        <div className={`hotel-results-main ${filtering ? 'is-filtering' : ''}`}>
          <div className="hotel-results-toolbar">
            <span>{filtering ? 'Обновляем варианты…' : `Показано ${visibleHotels.length} из ${result.hotels.length}`}</span>
            <label>Сортировка
              <select value={sort} onChange={(event) => setSort(event.target.value as HotelSort)}>
                <option value="recommended">Сначала рекомендованные</option>
                <option value="price">Сначала дешевле</option>
                <option value="rating">Сначала с высокой оценкой</option>
                <option value="center">Ближе к центру</option>
              </select>
            </label>
          </div>

          {visibleHotels.length === 0 && (
            <div className="hotel-filter-empty"><Hotel size={30} /><strong>По этим фильтрам вариантов нет</strong><p>Измените условия или сбросьте фильтры.</p></div>
          )}

          <div className="hotel-list">
        {visibleHotels.map((hotel) => {
          const key = hotelKey(hotel);
          const selected = shortlist.some((item) => hotelKey(item) === key);
          const photos = (hotel.photos || []).map(hotelPhotoUrl).filter(Boolean);
          const price = hotel.best_offer?.price;
          const checkoutUrl = hotel.best_offer?.checkout_url || hotel.checkout_url || String(hotel.checkout_ref?.fallback_url || '');
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
                  <img src={photos[0]} alt={hotel.name} loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <span><Hotel size={42} /></span>
                )}
                {photos.length > 1 && <b>Ещё {photos.length - 1} фото</b>}
              </div>
              <div className="hotel-card__body">
                <div className="hotel-card__eyebrow">
                  {hotel.stars ? <span>{"★".repeat(Math.min(5, hotel.stars))}</span> : <span>Без категории</span>}
                </div>
                <h3>{hotel.name}</h3>
                {hotel.address && <p className="hotel-card__address"><MapPin size={16} /> {hotel.address}</p>}
                <div className="hotel-card__features">
                  {hotel.best_offer?.breakfast_included === true && <span><Check size={14} /> Завтрак включён</span>}
                  {hotel.best_offer?.meal_name && <span>{hotel.best_offer.meal_name}</span>}
                  {hotel.best_offer?.free_cancellation === true && <span><Check size={14} /> Бесплатная отмена</span>}
                  {hotel.best_offer?.pay_at_hotel === true && <span>Оплата в отеле</span>}
                  {hotel.best_offer?.room_size_sqm && <span>Номер от {hotel.best_offer.room_size_sqm} м²</span>}
                  {highlights.map((highlight, index) => <span key={`${highlight}-${index}`}>{highlight}</span>)}
                </div>
                <button
                  className={`hotel-compare-toggle ${selected ? "is-selected" : ""}`}
                  type="button"
                  onClick={() => onToggle(hotel)}
                >
                  {selected ? <Check size={17} /> : <GitCompareArrows size={17} />}
                  {selected ? "В сравнении" : "Сравнить"}
                </button>
              </div>
              <aside className="hotel-card__aside">
                {rating !== undefined && (
                  <div className="hotel-rating">
                    <div>
                      <strong>{hotelRatingLabel(rating)}</strong>
                      {reviewCount && <small>{reviewCount.toLocaleString("ru-RU")} {pluralizeReviews(reviewCount)}</small>}
                    </div>
                    <b>{rating}</b>
                  </div>
                )}
                <div className="hotel-card__price">
                  <small>за {nights} {nights === 1 ? "ночь" : nights < 5 ? "ночи" : "ночей"}</small>
                  <strong>{price ? formatMoney(price.amount, price.currency) : "Цена на Туту"}</strong>
                </div>
                {checkoutUrl ? (
                  <a className="hotel-card__choose" href={checkoutUrl} target="_blank" rel="noreferrer">
                    Выбрать отель <ChevronRight size={18} />
                  </a>
                ) : <span className="hotel-card__unavailable">Переход временно недоступен</span>}
              </aside>
            </article>
          );
        })}
          </div>

          {loadMoreError && <div className="load-more-error">{loadMoreError}</div>}
          {result.meta.has_more && (
            <div className="load-more-block">
              <button type="button" onClick={onLoadMore} disabled={loadingMore || filtering}>
                {loadingMore ? "Загружаем отели…" : "Показать ещё отели"} <ArrowDown size={19} />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function HotelDetailsView({
  hotel,
  details,
  loading,
  error,
  bookingError,
  bookingRateId,
  onBack,
  onRetry,
  onBook,
}: {
  hotel: HotelOffer;
  details: HotelDetailsResponse | null;
  loading: boolean;
  error: string;
  bookingError: string;
  bookingRateId: string;
  onBack: () => void;
  onRetry: () => void;
  onBook: (rate: HotelRate) => void;
}) {
  const [bedFilter, setBedFilter] = useState('all');
  const [mealFilter, setMealFilter] = useState('all');
  const [freeCancellationOnly, setFreeCancellationOnly] = useState(false);
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});

  if (loading) {
    return (
      <section className="hotel-detail-page">
        <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={18} /> Назад</button>
        <section className="loading-card hotel-detail-loading">
          <span className="loading-card__eyebrow">Проверяем наличие</span>
          <h2>Загружаем номера в «{hotel.name}»</h2>
          <p className="loading-card__lead">Собираем доступные категории, тарифы и условия для выбранных дат.</p>
          <div className="loading-steps loading-steps--truthful"><div className="is-active"><span><Search size={20} /></span><p><strong>Ищем свободные номера</strong>Актуальные варианты появятся здесь</p></div></div>
        </section>
      </section>
    );
  }

  if (error || !details) {
    return (
      <section className="hotel-detail-page">
        <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={18} /> Назад</button>
        <div className="error-card">
          <CircleHelp size={26} />
          <div><strong>Не удалось загрузить номера</strong><p>{error || 'Попробуйте обновить данные.'}</p><button type="button" onClick={onRetry}>Повторить</button></div>
        </div>
      </section>
    );
  }

  const detailHotel = details.hotel;
  const photos = (detailHotel.photos?.length ? detailHotel.photos : (hotel.photos || []).map(hotelPhotoUrl)).filter(Boolean);
  const popularGroup = detailHotel.amenity_groups?.find((group) => (group.group_name || group.name || '').toLocaleLowerCase('ru-RU').includes('популяр'));
  const popularAmenities = (popularGroup?.amenities || detailHotel.amenity_groups?.flatMap((group) => group.amenities || []) || [])
    .map(hotelAmenityName)
    .filter(Boolean)
    .slice(0, 8);
  const reviewSummary = detailHotel.review_summary;
  const detailRating = hotelGuestRating(detailHotel);
  const detailReviewCount = reviewSummary?.review_count ?? detailHotel.review_count;
  const roomOptions = details.rooms || [];
  const bedOptions = Array.from(new Set(roomOptions.map((room) => room.bed_summary).filter((value): value is string => Boolean(value))));
  const filterRates = (rates: HotelRate[]) => rates.filter((rate) => {
    if (mealFilter === 'included' && !rate.meal?.included) return false;
    if (mealFilter === 'excluded' && rate.meal?.included) return false;
    if (freeCancellationOnly && !rate.free_cancellation) return false;
    return true;
  });
  const visibleRooms = roomOptions.filter((room) => {
    if (bedFilter !== 'all' && room.bed_summary !== bedFilter) return false;
    return filterRates(room.rates || []).length > 0;
  });
  const nights = details.stay?.nights || (details.stay?.check_in && details.stay?.check_out
    ? nightsBetween(details.stay.check_in, details.stay.check_out)
    : 1);
  const adults = details.stay?.guests?.adults || 1;
  const childrenCount = details.stay?.guests?.children_ages?.length || 0;

  return (
    <section className="hotel-detail-page">
      <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={18} /> К сравнению отелей</button>

      <div className="hotel-detail-heading">
        <div>
          <span className="hotel-detail-heading__stars">{detailHotel.stars ? `${'★'.repeat(detailHotel.stars)} · Отель` : 'Отель'}</span>
          <h2>{detailHotel.name}</h2>
          {detailHotel.address && <p><MapPin size={16} /> {detailHotel.address}</p>}
        </div>
        {detailRating !== undefined && (
          <div className="hotel-detail-rating">
            <b>{detailRating}</b>
            <span>
              <strong>{reviewSummary?.text || 'Оценка гостей'}</strong>
              {detailReviewCount !== undefined && <small>{detailReviewCount.toLocaleString('ru-RU')} {pluralizeReviews(detailReviewCount)}</small>}
            </span>
          </div>
        )}
      </div>

      {photos.length > 0 && (
        <div className={`hotel-gallery hotel-gallery--${Math.min(photos.length, 3)}`}>
          {photos.slice(0, 3).map((photo, index) => <img key={photo} src={photo} alt={`${detailHotel.name}, фото ${index + 1}`} referrerPolicy="no-referrer" />)}
        </div>
      )}

      {popularAmenities.length > 0 && (
        <div className="hotel-amenity-strip">
          {popularAmenities.map((amenity, index) => <span key={`${amenity}-${index}`}><Check size={14} /> {amenity}</span>)}
        </div>
      )}

      <div className="hotel-detail-layout">
        <div className="hotel-room-section">
          <div className="hotel-room-section__title">
            <div><span className="section-kicker">Следующий этап</span><h3>Выберите номер</h3><p>{visibleRooms.length} из {roomOptions.length} доступных категорий</p></div>
          </div>

          <div className="hotel-room-filters">
            <label><span>Кровати</span><select value={bedFilter} onChange={(event) => setBedFilter(event.target.value)}><option value="all">Любые</option>{bedOptions.map((bed) => <option key={bed} value={bed}>{bed}</option>)}</select></label>
            <label><span>Питание</span><select value={mealFilter} onChange={(event) => setMealFilter(event.target.value)}><option value="all">Любое</option><option value="included">Включено</option><option value="excluded">Не включено</option></select></label>
            <label className="hotel-room-filter-check"><input type="checkbox" checked={freeCancellationOnly} onChange={(event) => setFreeCancellationOnly(event.target.checked)} /><span><Check size={14} /> Бесплатная отмена</span></label>
          </div>

          {bookingError && <div className="load-more-error">{bookingError}</div>}

          {roomOptions.length > 0 && visibleRooms.length === 0 ? (
            <div className="hotel-room-empty">
              <BedDouble size={30} />
              <strong>Нет номеров с такими условиями</strong>
              <p>Измените фильтры, чтобы увидеть остальные доступные варианты.</p>
              <button type="button" onClick={() => { setBedFilter('all'); setMealFilter('all'); setFreeCancellationOnly(false); }}>Сбросить фильтры</button>
            </div>
          ) : visibleRooms.map((room, roomIndex) => {
            const roomKey = `${room.room_name}-${room.bed_summary || ''}-${roomIndex}`;
            const rates = filterRates(room.rates || []).sort((left, right) => (left.price?.amount || Infinity) - (right.price?.amount || Infinity));
            const visibleRates = expandedRooms[roomKey] ? rates : rates.slice(0, 3);
            const roomPhotos = room.photos || [];
            const roomDescription = room.room_description?.replace(/^•\s*/gm, '').trim();
            return (
              <article className="hotel-room-card" key={roomKey}>
                {roomPhotos.length > 0 && (
                  <div className="hotel-room-card__photos">
                    {roomPhotos.slice(0, 3).map((photo, index) => <img key={photo} src={photo} alt={`${room.room_name}, фото ${index + 1}`} loading="lazy" referrerPolicy="no-referrer" />)}
                  </div>
                )}
                <div className="hotel-room-card__body">
                  <h4>{room.room_name}</h4>
                  {roomDescription && <p>{roomDescription}</p>}
                  <div className="hotel-room-properties">
                    {room.bed_summary && <span><BedDouble size={16} /> {room.bed_summary}</span>}
                    {room.room_size_sqm && <span><Maximize2 size={16} /> {room.room_size_sqm} м²</span>}
                    {room.view && <span><MapPin size={16} /> Вид: {room.view}</span>}
                    {room.max_occupancy && <span>До {room.max_occupancy} гостей</span>}
                  </div>
                  {(room.room_amenities || []).length > 0 && (
                    <div className="hotel-room-amenities">
                      {(room.room_amenities || []).slice(0, 7).map((amenity) => <span key={amenity.id || amenity.name}><Check size={13} /> {amenity.name}</span>)}
                    </div>
                  )}
                </div>
                <div className="hotel-rate-list">
                  {visibleRates.map((rate, rateIndex) => {
                    const rateId = rate.id || rate.offerpack_hash || `${roomKey}-${rateIndex}`;
                    const cancellationDeadline = formatCancellationDeadline(rate.free_cancellation_until);
                    return (
                      <div className="hotel-rate" key={rateId}>
                        <div className="hotel-rate__conditions">
                          <strong><Coffee size={16} /> {rate.meal?.name || (rate.breakfast_included ? 'Завтрак включён' : 'Питание не включено')}</strong>
                          <span className={rate.free_cancellation ? 'is-positive' : ''}>{rate.free_cancellation ? `Бесплатная отмена${cancellationDeadline ? ` до ${cancellationDeadline}` : ''}` : rate.refundable === false ? 'Невозвратный тариф' : 'Условия отмены при оформлении'}</span>
                          <span>{rate.pay_at_hotel ? 'Оплата в отеле' : rate.pay_online ? 'Оплата онлайн' : 'Способ оплаты при оформлении'}</span>
                        </div>
                        <div className="hotel-rate__price">
                          <small>за {nights} {nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей'}</small>
                          <strong>{rate.price ? formatMoney(rate.price.amount, rate.price.currency) : 'Цена уточняется'}</strong>
                          <span>{adults + childrenCount} {adults + childrenCount === 1 ? 'гость' : 'гостей'}</span>
                        </div>
                        <button type="button" disabled={!rate.offerpack_hash || bookingRateId === rateId} onClick={() => onBook(rate)}>
                          {bookingRateId === rateId ? 'Открываем…' : 'Забронировать'}
                        </button>
                      </div>
                    );
                  })}
                  {rates.length > 3 && (
                    <button className="hotel-rate-list__more" type="button" onClick={() => setExpandedRooms((current) => ({ ...current, [roomKey]: !current[roomKey] }))}>
                      {expandedRooms[roomKey] ? 'Скрыть дополнительные тарифы' : `Показать ещё ${rates.length - 3} тарифов`}
                    </button>
                  )}
                </div>
              </article>
            );
          })}

          {roomOptions.length === 0 && (
            <div className="hotel-room-empty"><BedDouble size={30} /><strong>На выбранные даты свободных номеров нет</strong><p>{details.notices?.[0]?.message || details.notices?.[0]?.agent_hint || 'Попробуйте изменить даты или выбрать другой отель.'}</p></div>
          )}
        </div>

        <aside className="hotel-detail-sidebar">
          <section>
            <h3>Ваша поездка</h3>
            <div><span>Заезд</span><strong>{formatDate(details.stay?.check_in || '')}</strong>{detailHotel.check_in_time && <small>после {detailHotel.check_in_time.slice(0, 5)}</small>}</div>
            <div><span>Выезд</span><strong>{formatDate(details.stay?.check_out || '')}</strong>{detailHotel.check_out_time && <small>до {detailHotel.check_out_time.slice(0, 5)}</small>}</div>
            <div><span>Гости</span><strong>{adults} {adults === 1 ? 'взрослый' : 'взрослых'}{childrenCount ? `, ${childrenCount} детей` : ''}</strong><small>{nights} {nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей'}</small></div>
          </section>
          {(reviewSummary?.aspects || []).length > 0 && (
            <section className="hotel-review-aspects">
              <h3>Гости оценивают</h3>
              {(reviewSummary?.aspects || []).slice(0, 6).map((aspect) => (
                <div key={aspect.text || aspect.label}><span>{aspect.text || aspect.label}<b>{aspect.rating}</b></span><i><em style={{ width: `${Math.min(100, ((aspect.rating || 0) / (aspect.scale || 10)) * 100)}%` }} /></i></div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}

function HotelComparisonView({
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
  const [priority, setPriority] = useState<HotelPriority>('balance');
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [windowStart, setWindowStart] = useState(0);
  const windowSize = 4;
  const maxWindowStart = Math.max(0, hotels.length - windowSize);
  const ranking = useMemo(() => rankHotels(hotels, priority), [hotels, priority]);
  const priorityAvailability = useMemo(() => {
    const dimensions: Partial<Record<HotelPriority, keyof (typeof ranking)[number]['components']>> = {
      price: 'price',
      comfort: 'comfort',
      location: 'location',
      flexibility: 'flexibility',
    };
    return Object.fromEntries(hotelPriorities.map((item) => {
      const dimension = dimensions[item.id];
      const available = !dimension || rankHotels(hotels, item.id)
        .some((score) => score.components[dimension] !== null);
      return [item.id, available];
    })) as Record<HotelPriority, boolean>;
  }, [hotels]);
  const leaderScore = ranking[0];
  const leader = leaderScore?.hotel;
  const leaderUrl = leader?.best_offer?.checkout_url || leader?.checkout_url || String(leader?.checkout_ref?.fallback_url || '');
  const visibleHotels = hotels.slice(windowStart, windowStart + windowSize);
  const visibleHotelIndices = visibleHotels.map((hotel) => hotels.findIndex((item) => hotelKey(item) === hotelKey(hotel)));

  useEffect(() => {
    if (!priorityAvailability[priority]) setPriority('balance');
  }, [priority, priorityAvailability]);

  useEffect(() => {
    setWindowStart((current) => Math.min(current, maxWindowStart));
  }, [maxWindowStart]);

  const rows = useMemo(() => {
    const definitions = [
      {
        key: 'price',
        label: 'Цена за проживание',
        value: (hotel: HotelOffer) => hotel.best_offer?.price
          ? formatMoney(hotel.best_offer.price.amount, hotel.best_offer.price.currency)
          : 'Цена на Туту',
        metric: (hotel: HotelOffer) => hotel.best_offer?.price?.amount,
        best: 'min',
      },
      {
        key: 'night',
        label: 'Цена за ночь',
        value: (hotel: HotelOffer) => hotel.best_offer?.price
          ? formatMoney(Math.round(hotel.best_offer.price.amount / nights), hotel.best_offer.price.currency)
          : 'Не указана',
        metric: (hotel: HotelOffer) => hotel.best_offer?.price?.amount,
        best: 'min',
      },
      {
        key: 'guestNight',
        label: 'На гостя за ночь',
        value: (hotel: HotelOffer) => hotel.best_offer?.price
          ? formatMoney(Math.round(hotel.best_offer.price.amount / nights / Math.max(1, guests)), hotel.best_offer.price.currency)
          : 'Не указана',
        metric: (hotel: HotelOffer) => hotel.best_offer?.price?.amount,
        best: 'min',
      },
      {
        key: 'priceBasis',
        label: 'Что входит в цену',
        value: (hotel: HotelOffer) => hotel.best_offer?.price_basis === 'stay_total'
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
        value: (hotel: HotelOffer) => hotelDistanceToCenter(hotel) !== undefined
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
        value: (hotel: HotelOffer) => hotel.stars ? `${hotel.stars}★` : 'Без категории',
        metric: (hotel: HotelOffer) => hotel.stars,
        best: 'max',
      },
      {
        key: 'breakfast',
        label: 'Завтрак',
        value: (hotel: HotelOffer) => hotel.best_offer?.breakfast_included === true
          ? hotel.best_offer.meal_name || 'Включён'
          : hotel.best_offer?.breakfast_included === false
            ? hotel.best_offer.meal_name || 'Не включён'
            : hotel.best_offer?.meal_name || 'Не указано',
        metric: (hotel: HotelOffer) => typeof hotel.best_offer?.breakfast_included === 'boolean'
          ? Number(hotel.best_offer.breakfast_included)
          : undefined,
        best: 'max',
      },
      {
        key: 'cancellation',
        label: 'Отмена',
        value: (hotel: HotelOffer) => hotel.best_offer?.free_cancellation === true
          ? 'Бесплатная'
          : hotel.best_offer?.free_cancellation === false ? 'Не бесплатная' : 'Не указано',
        metric: (hotel: HotelOffer) => typeof hotel.best_offer?.free_cancellation === 'boolean'
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
        value: (hotel: HotelOffer) => hotel.best_offer?.room_size_sqm
          ? `от ${hotel.best_offer.room_size_sqm} м²`
          : 'Не указан',
        metric: (hotel: HotelOffer) => hotel.best_offer?.room_size_sqm ?? undefined,
        best: 'max',
      },
      {
        key: 'features',
        label: 'Особенности',
        value: (hotel: HotelOffer) => (hotel.best_offer?.highlights || [])
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
      const bestValue = known.length && definition.best
        ? definition.best === 'min' ? Math.min(...known) : Math.max(...known)
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
      <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={18} /> К отелям</button>
      <div className="comparison-title">
        <div>
          <span className="section-kicker">Ваш список проживания</span>
          <h2>Сравнение отелей</h2>
          <p>{formatDate(checkIn)} — {formatDate(checkOut)} · {hotels.length} {pluralizeHotels(hotels.length)}</p>
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
          <span><Hotel size={34} /></span>
          <h3>Добавьте хотя бы два отеля</h3>
          <button type="button" onClick={onBack}>Выбрать отели</button>
        </div>
      ) : (
        <>
          <div className="advisor-card hotel-advisor">
            <div className="advisor-card__head">
              <span><Sparkles size={23} /></span>
              <div><small>Куратор проживания</small><strong>Какой отель подойдёт именно вам?</strong></div>
            </div>
            <div className="advisor-priorities">
              {hotelPriorities.map((item) => (
                <button
                  className={priority === item.id ? 'is-active' : ''}
                  key={item.id}
                  type="button"
                  disabled={!priorityAvailability[item.id]}
                  title={priorityAvailability[item.id] ? undefined : 'В выбранных карточках нет данных для этого критерия'}
                  onClick={() => setPriority(item.id)}
                >
                  {priority === item.id && <Check size={15} />}{item.label}
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
                      <span key={strength}><Check size={14} /> {strength}</span>
                    ))}
                  </div>
                  <p className="curator-tradeoff">
                    <CircleHelp size={15} /> <strong>Главный компромисс:</strong> {leaderScore.tradeoff}
                  </p>
                </div>
                {leaderUrl && (
                  <a className="hotel-advisor__checkout" href={leaderUrl} target="_blank" rel="noreferrer">
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
                <strong>{windowStart + 1}–{Math.min(windowStart + windowSize, hotels.length)} из {hotels.length}</strong>
                <small>Листайте по одному отелю, не теряя контекст сравнения</small>
              </div>
              <div className="hotel-compare-window__controls">
                <button
                  type="button"
                  aria-label="Показать предыдущий отель"
                  disabled={windowStart === 0}
                  onClick={() => setWindowStart((current) => Math.max(0, current - 1))}
                >
                  <ArrowLeft size={20} />
                </button>
                <button
                  type="button"
                  aria-label="Показать следующий отель"
                  disabled={windowStart >= maxWindowStart}
                  onClick={() => setWindowStart((current) => Math.min(maxWindowStart, current + 1))}
                >
                  <ArrowRight size={20} />
                </button>
              </div>
            </div>
          )}

          <div
            className="compare-table hotel-compare-table"
            key={`hotel-window-${windowStart}-${visibleHotels.map(hotelKey).join('-')}`}
            style={{ "--compare-count": visibleHotels.length } as CSSProperties}
          >
            <div className="compare-table__corner">
              <span>Сравниваем</span>
              <strong>{visibleRows.length} параметров</strong>
              <small>
                {nights} {nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей'} · {guests} {guests === 1 ? 'гость' : guests < 5 ? 'гостя' : 'гостей'}
              </small>
            </div>
            {visibleHotels.map((hotel) => {
              const photo = hotel.photos?.map(hotelPhotoUrl).find(Boolean);
              const price = hotel.best_offer?.price;
              const checkoutUrl = hotel.best_offer?.checkout_url || hotel.checkout_url || String(hotel.checkout_ref?.fallback_url || '');
              const score = ranking.find((item) => hotelKey(item.hotel) === hotelKey(hotel));
              const isLeader = hotelKey(leader || hotel) === hotelKey(hotel);
              return (
                <article className={`compare-column-head hotel-compare-head ${isLeader ? 'is-leader' : ''}`} key={hotelKey(hotel)}>
                  {isLeader && <b>Рекомендуем</b>}
                  <button type="button" onClick={() => onRemove(hotel)} aria-label={`Убрать ${hotel.name}`}><X size={17} /></button>
                  <div className="hotel-compare-head__photo">
                    {photo ? <img src={photo} alt={hotel.name} loading="lazy" referrerPolicy="no-referrer" /> : <Hotel size={30} />}
                  </div>
                  <span className="hotel-compare-head__meta">{hotel.stars ? `${hotel.stars}★` : 'Отель'} · индекс {score?.total || 0}/100</span>
                  <h3>{hotel.name}</h3>
                  <p>{hotel.address || 'Адрес не указан'}</p>
                  <strong>{price ? formatMoney(price.amount, price.currency) : 'Цена на Туту'}</strong>
                  {checkoutUrl && (
                    <a className="hotel-compare-head__choose" href={checkoutUrl} target="_blank" rel="noreferrer">
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
                  <div className={row.best[hotelIndex] ? 'is-best' : ''} key={`${row.key}-${hotelKey(hotels[hotelIndex])}`}>
                    {row.best[hotelIndex] && <Check size={15} />}
                    <span>{row.values[hotelIndex]}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="data-note"><ShieldCheck size={16} /> Цены и наличие могут измениться до завершения бронирования.</p>
        </>
      )}
    </section>
  );
}

function ResultsView({
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
      if (maxPrice !== null && Number.isFinite(maxPrice) && offer.price.amount > maxPrice) return false;
      return true;
    });

    return priority ? rankOffers(filtered, priority) : filtered;
  }, [directOnly, priceMax, priority, result.variants]);

  const filtersActive = directOnly || Boolean(priceMax);
  const activePriorityLabel = priorities.find((item) => item.id === priority)?.label;
  const unavailableSourceSummary = Array.from(new Set((result.meta.unavailable || []).map((entry) => {
    if (typeof entry === 'string') return entry;
    const label = entry.mode && entry.mode in modeMeta
      ? modeMeta[entry.mode as TransportMode].label.toLowerCase()
      : 'источник';
    return `${label}: ${entry.reason || 'не ответил после повторных попыток'}`;
  })));

  return (
    <section className="results-section">
      <div className="results-heading">
        <div>
          <span className="section-kicker">Цены и наличие обновлены</span>
          <h2>{route}</h2>
          <p>{formatDate(result.variants[0]?.departure_at)} · показано {visibleOffers.length} {pluralizeVariants(visibleOffers.length)}{visibleOffers.length !== result.variants.length ? ` из ${result.variants.length}` : ""}</p>
        </div>
      </div>

      {result.meta.unavailable && result.meta.unavailable.length > 0 && (
        <div className="notice-card">
          Не удалось обновить после повторных попыток: {unavailableSourceSummary.join('; ')}. Остальные реальные варианты показаны.
        </div>
      )}

      {result.meta.is_cached && (
        <div className="notice-card">Показываем последние доступные результаты. Итоговая цена подтвердится перед покупкой.</div>
      )}

      {result.meta.passenger_note && <div className="notice-card">{result.meta.passenger_note}</div>}

      {(activePriorityLabel || filtersActive) && (
        <div className="active-result-controls">
          <span>Выдача обновлена без нового поиска</span>
          {activePriorityLabel && <b>Сначала: {activePriorityLabel.toLowerCase()}</b>}
          {directOnly && <b>Без пересадок</b>}
          {priceMax && <b>До {Number(priceMax).toLocaleString("ru-RU")} ₽</b>}
          <button type="button" onClick={onResetFilters}>Сбросить всё</button>
        </div>
      )}

      <div className="result-list">
        {visibleOffers.map((offer, index) => {
          const meta = modeMeta[offer.transport];
          const Icon = meta.icon;
          const selected = shortlist.some((item) => item.offer_id === offer.offer_id);
          const recommendation = result.recommendations.find((item) => item.offerId === offer.offer_id);
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
          const hasRailFacts = offer.transport === "railway" && Boolean(offer.fares);
          return (
            <article className={`offer-card offer-card--${meta.className}`} key={offer.offer_id}>
              <div className="offer-card__main">
                <div className="offer-card__carrier">
                  <span><Icon size={25} /></span>
                  <div>
                    <strong>{offer.carriers?.join(" · ") || meta.label}</strong>
                    <small>{meta.label}{tripNumber ? ` ${tripNumber}` : ""}{vehicleName ? ` · ${vehicleName}` : ""}</small>
                  </div>
                  {recommendation && <b>{recommendation.eyebrow}</b>}
                </div>
                <div className="route-times">
                  <strong>{formatTime(offer.departure_at)}</strong>
                  <div>
                    <small>{formatDuration(offer.duration_min)} в пути</small>
                    <span />
                    <b>{offer.analysis.changes === 0 ? "Прямой" : `${offer.analysis.changes} ${offer.analysis.changes === 1 ? "пересадка" : "пересадки"}`}</b>
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
                    className={`compare-toggle ${selected ? "is-selected" : ""}`}
                    type="button"
                    onClick={() => onToggle(offer)}
                    disabled={!selected && shortlist.length >= 4}
                    title={!selected && shortlist.length >= 4 ? "Можно сравнить не больше 4 вариантов" : undefined}
                  >
                    {selected ? <Check size={18} /> : <GitCompareArrows size={18} />}
                    {selected ? "В сравнении" : "Сравнить"}
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
                        ? `${offer.review_summary.review_count.toLocaleString("ru-RU")} ${pluralizeReviews(offer.review_summary.review_count)}`
                        : "Есть отзывы"}
                    </span>
                    <b>{offer.review_summary.rating}</b>
                  </div>
                )}
                <div className="offer-facts">
                  {cabinBaggage && <span><BriefcaseBusiness size={17} /> {cabinBaggage}</span>}
                  {baggage && <span className={baggage === "Без багажа" ? "is-muted" : ""}><Luggage size={17} /> {baggage}</span>}
                  {baggageUpgrade && <span><Luggage size={17} /> {baggageUpgrade}</span>}
                  {fareConditions?.fare_family && <span>Тариф «{fareConditions.fare_family}»</span>}
                  {hasRailFacts && <span>{seatTypes}</span>}
                  {hasRailFacts && offer.fares?.refundable_count !== undefined && (
                    <span>{offer.fares.refundable_count > 0 ? `${offer.fares.refundable_count} возвратных тарифов` : "Возвратных тарифов нет"}</span>
                  )}
                  {offer.review_summary?.aspects?.slice(0, 2).map((aspect) => (
                    <span key={aspect.text || aspect.label}>
                      <Star size={14} fill="currentColor" /> {aspect.text || "Оценка"}: {aspect.rating ?? "—"}/10
                    </span>
                  ))}
                </div>
                <div className="offer-price">
                  <div>
                    <strong>{formatMoney(offer.price.amount, offer.price.currency)}</strong>
                    <small>{offer.transport === "railway" ? "билет от" : "за всех"}</small>
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
          <span><Search size={28} /></span>
          <h3>Нет вариантов с такими условиями</h3>
          <p>Снимите часть фильтров — исходная выдача уже загружена.</p>
          <button type="button" onClick={onResetFilters}>Сбросить фильтры</button>
        </div>
      )}

      {loadMoreError && (
        <div className="load-more-error">{loadMoreError}</div>
      )}

      {result.meta.has_more && (
        <div className="load-more-block">
          <button type="button" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Загружаем варианты…" : "Показать ещё"}
            <ArrowDown size={19} />
          </button>
          <span>
            Ещё есть: {Object.entries(result.meta.mode_pagination || {})
              .filter(([, page]) => page?.has_more)
              .map(([mode]) => modeMeta[mode as TransportMode].label.toLowerCase())
              .join(", ") || "другие варианты"}
          </span>
        </div>
      )}
    </section>
  );
}

function ComparisonView({
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
      ["transport", "Транспорт", (offer: Offer) => modeMeta[offer.transport].label],
      ["price", "Цена", (offer: Offer) => formatMoney(offer.price.amount, offer.price.currency)],
      ["duration", "Время в пути", (offer: Offer) => formatDuration(offer.duration_min)],
      ["departure", "Отправление", (offer: Offer) => `${formatTime(offer.departure_at)} · ${formatDate(offer.departure_at)}`],
      ["arrival", "Прибытие", (offer: Offer) => `${formatTime(offer.arrival_at)} · ${formatDate(offer.arrival_at)}`],
      ["from", "Откуда", (offer: Offer) => firstSegment(offer)?.from || "Не указано"],
      ["to", "Куда", (offer: Offer) => lastSegment(offer)?.to || "Не указано"],
      ["changes", "Пересадки", (offer: Offer) => offer.analysis.changes ? `${offer.analysis.changes}` : "Без пересадок"],
      ["carrier", "Перевозчик", (offer: Offer) => offer.carriers?.join(", ") || "Не указан"],
      ["rating", "Рейтинг", ratingValue],
      ["refund", "Возврат", refundValue],
      ["baggage", "Багаж", baggageValue],
      ["class", "Варианты мест", seatCategories],
      ["stress", "Нагрузка поездки", (offer: Offer) => `${offer.analysis.stressScore}/100`],
    ] as Array<[string, string, (offer: Offer) => string]>;
    return definitions.map(([key, label, getValue]) => ({
      key,
      label,
      values: offers.map(getValue),
    }));
  }, [offers]);

  const visibleRows = onlyDifferences
    ? rows.filter((row) => new Set(row.values).size > 1)
    : rows;

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
          <p>{route} · {offers.length} {pluralizeVariants(offers.length)}</p>
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
          <span><GitCompareArrows size={34} /></span>
          <h3>Добавьте хотя бы два варианта</h3>
          <p>Вернитесь к результатам и нажмите «Сравнить» на подходящих карточках.</p>
          <button type="button" onClick={onBack}>Выбрать варианты</button>
        </div>
      ) : (
        <>
          <div className="advisor-card">
            <div className="advisor-card__head">
              <span><Sparkles size={23} /></span>
              <div><small>Куратор Туту</small><strong>Что для вас важнее?</strong></div>
            </div>
            <div className="advisor-priorities">
              {priorities.map((item) => (
                <button
                  className={priority === item.id ? "is-active" : ""}
                  key={item.id}
                  type="button"
                  onClick={() => onPriority(item.id)}
                >
                  {priority === item.id && <Check size={15} />}{item.label}
                </button>
              ))}
            </div>
            {leader && leaderMeta && curatorVerdict && (
              <div className="advisor-verdict">
                <BadgeCheck size={27} />
                <div>
                  <span>Рекомендуем</span>
                  <h3>{leaderMeta.label} · {formatTime(leader.departure_at)}</h3>
                  <p className="curator-summary">{curatorVerdict.summary}</p>
                  <div className="curator-strengths">
                    {curatorVerdict.strengths.map((strength) => (
                      <span key={strength}><Check size={14} /> {strength}</span>
                    ))}
                  </div>
                  <p className="curator-tradeoff">
                    <CircleHelp size={15} /> <strong>Главный компромисс:</strong> {curatorVerdict.tradeoff}
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
            style={{ "--compare-count": offers.length } as CSSProperties}
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
                <article className={`compare-column-head ${isLeader ? "is-leader" : ""}`} key={offer.offer_id}>
                  {isLeader && <b>Рекомендуем</b>}
                  <button type="button" onClick={() => onRemove(offer)} aria-label="Удалить из сравнения"><X size={17} /></button>
                  <span className={`mode-circle mode-circle--${meta.className}`}><Icon size={24} /></span>
                  <h3>{meta.label}</h3>
                  <p>{offer.carriers?.join(" · ") || "Перевозчик не указан"}</p>
                  <strong>{formatMoney(offer.price.amount, offer.price.currency)}</strong>
                </article>
              );
            })}

            {visibleRows.map((row) => (
              <div className="compare-row" key={row.key}>
                <div className="compare-row__label">{row.label}</div>
                {row.values.map((value, index) => {
                  const bestPrice = row.key === "price" && offers[index].price.amount === Math.min(...offers.map((offer) => offer.price.amount));
                  const bestDuration = row.key === "duration" && offers[index].duration_min === Math.min(...offers.map((offer) => offer.duration_min));
                  return (
                    <div className={bestPrice || bestDuration ? "is-best" : ""} key={`${row.key}-${offers[index].offer_id}`}>
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

export default App;
