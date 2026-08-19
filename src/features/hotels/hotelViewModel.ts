import type { HotelOffer } from '../../types';
import type { HotelPriority } from '../../hotelScoring';

export interface HotelFilterState {
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

export const initialHotelFilters: HotelFilterState = {
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

export const hotelPriorities: Array<{ id: HotelPriority; label: string }> = [
  { id: 'balance', label: 'Баланс' },
  { id: 'price', label: 'Дешевле' },
  { id: 'comfort', label: 'Комфорт' },
  { id: 'location', label: 'Ближе к центру' },
  { id: 'flexibility', label: 'Гибкие условия' },
];

export const hotelTypeOptions = [
  ['hotel', 'Отели'],
  ['apartments', 'Квартиры'],
  ['aparthotel', 'Апарт-отели'],
  ['guesthouse', 'Гостевые дома'],
  ['hostel', 'Хостелы'],
  ['cottage', 'Коттеджи и дома'],
] as const;

export const hotelMealOptions = [
  ['breakfast', 'Завтрак'],
  ['halfboard', 'Завтрак + обед или ужин'],
  ['fullboard', 'Завтрак, обед и ужин'],
  ['allinclusive', 'Всё включено'],
  ['nomeal', 'Питание не включено'],
] as const;

export const hotelAmenityOptions = [
  ['pool', 'Бассейн'],
  ['parking', 'Парковка'],
  ['wifi', 'Wi-Fi'],
  ['spa', 'Спа'],
  ['pet_friendly', 'Можно с животными'],
  ['kitchen', 'Кухня'],
  ['fitness', 'Тренажёрный зал'],
  ['beach', 'Пляж'],
] as const;

export const roomAmenityOptions = [
  ['private_bath', 'Собственная ванная'],
  ['workspace', 'Рабочее место'],
  ['room_kitchen', 'Кухня в номере'],
  ['room_wifi', 'Wi-Fi в номере'],
  ['air_conditioner', 'Кондиционер'],
  ['balcony', 'Балкон'],
] as const;

/** Return the most stable identity available in a real Tutu hotel offer. */
export function hotelKey(hotel: HotelOffer): string {
  return String(
    hotel.hotel_id || hotel.hotel_geo_id || hotel.tutu_offer_id || hotel.alias || hotel.name,
  );
}

export function formatMoney(amount: number, currency = 'RUB'): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount % 1 ? 2 : 0,
  }).format(amount);
}

export function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
}

export function pluralizeReviews(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'отзывов';
  if (mod10 === 1) return 'отзыв';
  if (mod10 >= 2 && mod10 <= 4) return 'отзыва';
  return 'отзывов';
}

export function pluralizeHotels(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'отелей';
  if (mod10 === 1) return 'отель';
  if (mod10 >= 2 && mod10 <= 4) return 'отеля';
  return 'отелей';
}

export function hotelGuestRating(hotel: {
  rating?: number;
  review_summary?: { rating?: number };
}): number | undefined {
  const rating = hotel.review_summary?.rating ?? hotel.rating;
  return typeof rating === 'number' && Number.isFinite(rating) && rating > 0 ? rating : undefined;
}

export function hotelPhotoUrl(photo: NonNullable<HotelOffer['photos']>[number]): string {
  if (typeof photo === 'string') return photo;
  return photo?.large_url || photo?.original_url || photo?.url || photo?.src || '';
}

export function hotelHighlightText(highlight: string | { text?: string }): string {
  return typeof highlight === 'string' ? highlight : highlight.text || '';
}

export function hotelRatingLabel(rating: number): string {
  if (rating >= 9) return 'Превосходно';
  if (rating >= 8) return 'Очень хорошо';
  if (rating >= 7) return 'Хорошо';
  return 'Есть отзывы';
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = new Date(`${checkIn}T12:00:00`).getTime();
  const end = new Date(`${checkOut}T12:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000));
}
