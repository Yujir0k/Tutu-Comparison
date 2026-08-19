export type TransportMode = 'avia' | 'railway' | 'bus' | 'etrain';
export type Priority = 'balance' | 'price' | 'time' | 'calm';

export interface Money {
  amount: number;
  currency: string;
}

export interface ReviewSummary {
  rating?: number;
  review_count?: number;
  text?: string;
  label?: string;
  scale?: number;
  source?: string;
  scope?: string;
  subject?: string;
  aspects?: Array<{ rating?: number; scale?: number; text?: string; label?: string }>;
}

export interface Segment {
  from: string;
  to: string;
  departure_at: string;
  arrival_at: string;
  duration_min: number;
  carrier?: string | null;
  voyage_no?: string | null;
  vehicle_meta?: {
    name?: string;
    is_premium?: boolean;
    is_double_decker?: boolean;
  };
}

export interface Leg {
  label?: string;
  from: string;
  to: string;
  departure_at: string;
  arrival_at: string;
  duration_min: number;
  segments: Segment[];
}

export interface OfferAnalysis {
  stressScore: number;
  routeScore: number;
  changes: number;
  overnight: boolean;
  confidence: number;
  components: {
    price: number | null;
    time: number | null;
    calm: number;
    reliability: number | null;
    flexibility: number | null;
  };
  reasons: string[];
}

export interface Offer {
  offer_id: string;
  transport: TransportMode;
  price: Money;
  duration_min: number;
  carriers: string[];
  search_results_url?: string;
  checkout_url?: string;
  checkout_ref?: Record<string, unknown>;
  departure_at: string;
  arrival_at: string;
  segments_count?: number;
  legs: Leg[];
  review_summary?: ReviewSummary;
  fares?: {
    count?: number;
    price_from?: number;
    price_to?: number;
    currency?: string;
    refundable_count?: number;
    changeable_count?: number;
    refundable_unknown?: number;
    changeable_unknown?: number;
    seat_categories?: Record<string, { count?: number; price_from?: number }>;
  };
  variants?: Array<{
    variant_id?: string;
    offer_hash?: string;
    price?: Money;
    service_class?: string;
    conditions?: {
      fare_family?: string | null;
      refundable?: boolean | null;
      changeable?: boolean | null;
      baggage?: { kg?: number | null; pieces?: number | null } | null;
      cabin_baggage?: {
        kg?: number | null;
        pieces?: number | null;
        dimensions?: string | null;
      } | null;
    };
  }>;
  is_multi_pnr?: boolean;
  multi_pnr_note?: string;
  analysis: OfferAnalysis;
}

export interface ResolvedPlace {
  name: string;
  geo_id?: string;
  region?: string;
  iata?: string;
  also_named?: Array<{ name?: string; geo_id?: string; region?: string; iata?: string }>;
}

export interface SearchMeta {
  from?: ResolvedPlace;
  to?: ResolvedPlace;
  unavailable?: Array<{ mode?: string; reason?: string } | string>;
  total_returned?: number;
  has_more?: boolean;
  page?: number;
  page_size?: number;
  mode_pagination?: Partial<Record<TransportMode, { returned: number; has_more: boolean }>>;
  modes_summary?: Record<
    string,
    { count?: number; min_price?: number | null; min_duration_min?: number | null }
  >;
  is_cached?: boolean;
  cached_at?: string;
  passenger_note?: string;
  scoring_version?: string;
}

export interface Recommendation {
  kind: 'balanced' | 'cheap' | 'fast';
  title: string;
  eyebrow: string;
  caption: string;
  offerId: string;
}

export interface AgentStep {
  id: string;
  name: string;
  role: string;
  detail: string;
  durationMs: number;
}

export interface SearchResponse {
  requestId: string;
  elapsedMs: number;
  variants: Offer[];
  recommendations: Recommendation[];
  agents: AgentStep[];
  meta: SearchMeta;
}

export interface SearchPayload {
  origin: string;
  originId: string;
  destination: string;
  destinationId: string;
  departureDate: string;
  adults: number;
  childrenAges: number[];
  priority: Priority;
  priceMax?: number;
  directOnly: boolean;
  modes: TransportMode[];
  page?: number;
}

export interface HotelPhoto {
  url?: string;
  src?: string;
  large_url?: string;
  original_url?: string;
  alt?: string;
}

export interface HotelOffer {
  hotel_id?: string | number;
  hotel_geo_id?: string | number;
  tutu_offer_id?: string;
  alias?: string;
  name: string;
  stars?: number;
  rating?: number;
  review_count?: number;
  address?: string;
  review_summary?: ReviewSummary;
  photos?: Array<string | HotelPhoto>;
  photos_total?: number;
  checkout_url?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    lat?: number;
    lng?: number;
    city?: string | null;
    city_geo_id?: string | number | null;
    distance_to_center_km?: number;
  };
  best_offer?: {
    price?: Money;
    offerpack_hash?: string;
    checkout_url?: string;
    room_name?: string | null;
    price_basis?: string | null;
    room_size_sqm?: number | null;
    breakfast_included?: boolean | null;
    meal_name?: string | null;
    free_cancellation?: boolean | null;
    pay_at_hotel?: boolean | null;
    pay_online?: boolean | null;
    highlights?: Array<string | { type?: string; text?: string }>;
  };
  checkout_ref?: Record<string, unknown>;
}

export interface HotelSearchPayload {
  cityName: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  childrenAges: number[];
  page?: number;
  stars?: number[];
  priceMax?: number;
  meals?: string[];
  hotelTypes?: string[];
  minRating?: number;
  freeCancellation?: boolean;
  breakfastIncluded?: boolean;
  hotelAmenities?: string[];
  roomAmenities?: string[];
}

export interface HotelSearchResponse {
  requestId: string;
  elapsedMs: number;
  hotels: HotelOffer[];
  meta: {
    page?: number;
    page_size?: number;
    has_more?: boolean;
    total_returned?: number;
    geo_id?: string;
    resolved_geo?: { name?: string; geo_id?: string; region?: string; geo_type?: string };
    stay?: { nights?: number; check_in?: string; check_out?: string };
    is_cached?: boolean;
    cached_at?: string;
  };
}
