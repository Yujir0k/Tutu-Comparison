import type { TravelLocation } from '../src/locations.js';
import type { HotelSearchPayload, Priority, SearchPayload, TransportMode } from '../src/types.js';

export const allowedModes = new Set<TransportMode>(['avia', 'railway', 'bus', 'etrain']);
const allowedPriorities = new Set<Priority>(['balance', 'price', 'time', 'calm']);
const hotelMeals = new Set([
  'breakfast',
  'halfboard',
  'allinclusive',
  'fullboard',
  'lunch',
  'dinner',
  'nomeal',
]);
const hotelTypes = new Set([
  'hotel',
  'apartments',
  'hostel',
  'aparthotel',
  'guesthouse',
  'cottage',
]);
const hotelAmenities = new Set([
  'pool',
  'parking',
  'wifi',
  'spa',
  'transfer',
  'kid_friendly',
  'pet_friendly',
  'kitchen',
  'fitness',
  'sauna',
  'jacuzzi',
  'aquapark',
  'kids_pool',
  'beach',
  'elevator',
  'minibar',
  'fridge',
  'buffet',
]);
const roomAmenities = new Set([
  'sea_view',
  'mountain_view',
  'view',
  'balcony',
  'air_conditioner',
  'private_bath',
  'room_wifi',
  'room_kitchen',
  'workspace',
]);

export class ValidationError extends Error {
  readonly statusCode = 400;
}

type LocationResolver = (id: string) => TravelLocation | undefined;

/** Validate and normalize a transport search request at the trust boundary. */
export function validateSearch(
  body: Partial<SearchPayload>,
  resolveLocation: LocationResolver,
): SearchPayload {
  const origin = String(body.origin || '').trim();
  const destination = String(body.destination || '').trim();
  const originId = String(body.originId || '').trim();
  const destinationId = String(body.destinationId || '').trim();
  const departureDate = String(body.departureDate || '').trim();
  const adults = Number(body.adults || 1);
  const childrenAges = Array.isArray(body.childrenAges) ? body.childrenAges.map(Number) : [];
  const priority = body.priority || 'balance';
  const priceMax = body.priceMax ? Number(body.priceMax) : undefined;
  const page = Number(body.page || 1);
  const modes = Array.isArray(body.modes)
    ? Array.from(
        new Set(body.modes.filter((mode): mode is TransportMode => allowedModes.has(mode))),
      )
    : [];

  const originLocation = resolveLocation(originId);
  const destinationLocation = resolveLocation(destinationId);
  if (!originLocation || originLocation.name !== origin)
    fail('Проверьте город отправления: выберите его из списка');
  if (!destinationLocation || destinationLocation.name !== destination)
    fail('Проверьте город прибытия: выберите его из списка');
  if (originId === destinationId) fail('Проверьте маршрут: города должны отличаться');
  validateFutureDate(departureDate, 'дату отправления');
  validateGuests(adults, childrenAges, 8);
  if (!allowedPriorities.has(priority)) fail('Проверьте выбранный приоритет');
  if (
    priceMax !== undefined &&
    (!Number.isFinite(priceMax) || priceMax < 1 || priceMax > 100_000_000)
  ) {
    fail('Проверьте максимальную цену');
  }
  if (!modes.length) fail('Выберите хотя бы один вид транспорта');
  if (!Number.isInteger(page) || page < 1 || page > 10) fail('Проверьте номер страницы выдачи');

  return {
    origin,
    originId,
    destination,
    destinationId,
    departureDate,
    adults,
    childrenAges,
    priority,
    priceMax,
    directOnly: body.directOnly === true,
    modes,
    page,
  };
}

/** Validate and normalize a hotel search request at the trust boundary. */
export function validateHotelSearch(body: Partial<HotelSearchPayload>): HotelSearchPayload {
  const cityName = String(body.cityName || '').trim();
  const checkIn = String(body.checkIn || '').trim();
  const checkOut = String(body.checkOut || '').trim();
  const adults = Number(body.adults || 1);
  const childrenAges = Array.isArray(body.childrenAges) ? body.childrenAges.map(Number) : [];
  const page = Number(body.page || 1);
  const stars = Array.isArray(body.stars)
    ? Array.from(
        new Set(
          body.stars
            .map(Number)
            .filter((value) => Number.isInteger(value) && value >= 0 && value <= 5),
        ),
      )
    : undefined;
  const priceMax = body.priceMax ? Number(body.priceMax) : undefined;
  const minRating = body.minRating ? Number(body.minRating) : undefined;

  if (cityName.length < 2 || cityName.length > 80) fail('Проверьте город проживания');
  validateFutureDate(checkIn, 'дату заезда');
  validateDate(checkOut, 'дату выезда');
  const nights = dateDifferenceInDays(checkIn, checkOut);
  if (nights < 1 || nights > 30) fail('Проверьте даты: проживание должно длиться от 1 до 30 ночей');
  validateGuests(adults, childrenAges, 10, 6);
  if (!Number.isInteger(page) || page < 1 || page > 10) fail('Проверьте номер страницы выдачи');
  if (
    priceMax !== undefined &&
    (!Number.isFinite(priceMax) || priceMax < 1 || priceMax > 10_000_000)
  )
    fail('Проверьте максимальную цену');
  if (minRating !== undefined && ![7, 8, 9].includes(minRating))
    fail('Проверьте минимальный рейтинг');

  return {
    cityName,
    checkIn,
    checkOut,
    adults,
    childrenAges,
    page,
    stars: stars?.length ? stars : undefined,
    priceMax,
    meals: cleanValues(body.meals, hotelMeals),
    hotelTypes: cleanValues(body.hotelTypes, hotelTypes),
    minRating,
    freeCancellation: body.freeCancellation === true ? true : undefined,
    breakfastIncluded: body.breakfastIncluded === true ? true : undefined,
    hotelAmenities: cleanValues(body.hotelAmenities, hotelAmenities),
    roomAmenities: cleanValues(body.roomAmenities, roomAmenities),
  };
}

/** Accept only checkout references for products supported by this application. */
export function validateCheckoutRef(value: unknown): Record<string, unknown> {
  if (!isPlainRecord(value)) fail('Не хватает данных выбранного предложения');
  const transport = String(value.transport || '');
  if (transport !== 'hotels' && !allowedModes.has(transport as TransportMode)) {
    fail('Неизвестный вид транспорта');
  }
  return value;
}

function validateGuests(
  adults: number,
  childrenAges: number[],
  maxGuests: number,
  maxAdults = 8,
): void {
  if (!Number.isInteger(adults) || adults < 1 || adults > maxAdults)
    fail('Проверьте количество взрослых');
  if (
    childrenAges.length > 4 ||
    adults + childrenAges.length > maxGuests ||
    childrenAges.some((age) => !Number.isInteger(age) || age < 0 || age > 17)
  ) {
    fail('Проверьте возраст и количество детей');
  }
}

function validateFutureDate(value: string, label: string): void {
  validateDate(value, label);
  const today = new Date().toISOString().slice(0, 10);
  const maximum = new Date();
  maximum.setUTCDate(maximum.getUTCDate() + 730);
  if (value < today || value > maximum.toISOString().slice(0, 10)) fail(`Проверьте ${label}`);
}

function validateDate(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`Проверьте ${label}`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    fail(`Проверьте ${label}`);
}

function dateDifferenceInDays(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000,
  );
}

function cleanValues(values: unknown, allowed: Set<string>): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const cleaned = Array.from(new Set(values.map(String).filter((value) => allowed.has(value))));
  return cleaned.length ? cleaned : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new ValidationError(message);
}
