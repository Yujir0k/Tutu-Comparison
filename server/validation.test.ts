import assert from 'node:assert/strict';
import test from 'node:test';
import type { TravelLocation } from '../src/locations.js';
import {
  ValidationError,
  validateCheckoutRef,
  validateHotelSearch,
  validateSearch,
} from './validation.js';

const locations = new Map<string, TravelLocation>([
  ['moscow', { id: 'moscow', name: 'Москва', region: 'Москва', country: 'Россия' }],
  ['spb', { id: 'spb', name: 'Санкт-Петербург', region: 'Санкт-Петербург', country: 'Россия' }],
]);

const futureDate = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

test('transport validation normalizes duplicates and accepts confirmed locations', () => {
  const payload = validateSearch(
    {
      origin: 'Москва',
      originId: 'moscow',
      destination: 'Санкт-Петербург',
      destinationId: 'spb',
      departureDate: futureDate(7),
      adults: 2,
      childrenAges: [8],
      priority: 'balance',
      directOnly: true,
      modes: ['avia', 'avia', 'railway'],
    },
    (id) => locations.get(id),
  );

  assert.deepEqual(payload.modes, ['avia', 'railway']);
  assert.equal(payload.page, 1);
});

test('transport validation rejects a forged location and invalid calendar date', () => {
  assert.throws(
    () =>
      validateSearch(
        {
          origin: 'Москва',
          originId: 'unknown',
          destination: 'Санкт-Петербург',
          destinationId: 'spb',
          departureDate: '2026-02-31',
          modes: ['avia'],
        },
        (id) => locations.get(id),
      ),
    ValidationError,
  );
});

test('hotel validation strips unsupported filter values', () => {
  const payload = validateHotelSearch({
    cityName: 'Москва',
    checkIn: futureDate(10),
    checkOut: futureDate(12),
    adults: 2,
    childrenAges: [],
    meals: ['breakfast', 'invented'],
    hotelTypes: ['hotel', 'castle'],
    hotelAmenities: ['wifi', 'unknown'],
  });

  assert.deepEqual(payload.meals, ['breakfast']);
  assert.deepEqual(payload.hotelTypes, ['hotel']);
  assert.deepEqual(payload.hotelAmenities, ['wifi']);
});

test('hotel validation limits stay duration', () => {
  assert.throws(
    () =>
      validateHotelSearch({
        cityName: 'Москва',
        checkIn: futureDate(1),
        checkOut: futureDate(40),
        adults: 1,
        childrenAges: [],
      }),
    /от 1 до 30 ночей/,
  );
});

test('checkout validation allows only supported product references', () => {
  assert.deepEqual(validateCheckoutRef({ transport: 'hotels', hotel_id: '42' }), {
    transport: 'hotels',
    hotel_id: '42',
  });
  assert.throws(() => validateCheckoutRef({ transport: 'spaceship' }), ValidationError);
  assert.throws(() => validateCheckoutRef([]), ValidationError);
});
