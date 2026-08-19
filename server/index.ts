import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import { analyseOffers, curateRecommendations } from './agents.js';
import { FileCache } from './cache.js';
import {
  createRateLimiter,
  errorBoundary,
  hardenHttp,
  sendPublicError,
  upstreamMessage,
} from './http.js';
import { requestLogger } from './logger.js';
import { callTutuTool } from './mcp.js';
import { getTravelLocation, type TravelLocation } from '../src/locations.js';
import { TRANSPORT_SCORING_VERSION } from '../src/scoring.js';
import { validateCheckoutRef, validateHotelSearch, validateSearch } from './validation.js';
import type {
  AgentStep,
  HotelOffer,
  HotelSearchPayload,
  HotelSearchResponse,
  SearchPayload,
  SearchResponse,
  TransportMode,
} from '../src/types.js';

interface TutuSearchResult {
  variants?: Array<Record<string, unknown>>;
  meta?: SearchResponse['meta'];
}

interface TutuHotelSearchResult {
  hotels?: HotelOffer[];
  meta?: HotelSearchResponse['meta'];
}

export const app = express();
const resolvedLocations = new Map<string, TravelLocation>();
const locationQueries = new Map<string, { expiresAt: number; locations: TravelLocation[] }>();
const cache = new FileCache({ directory: path.resolve(process.cwd(), '.tutu-cache') });

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.use(hardenHttp);
app.use(requestLogger);
app.use('/api', createRateLimiter({ windowMs: 60_000, max: 120 }));
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json({
    ok: true,
    service: 'tutu-comparison-api',
    version: process.env.APP_VERSION || 'development',
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get('/api/locations', async (request, response) => {
  const query = String(request.query.q || '').trim();
  if (query.length < 2 || query.length > 80) {
    response.json({ locations: [] });
    return;
  }

  const key = query.toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
  const cached = locationQueries.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    response.json({ locations: cached.locations, source: 'Tutu MCP' });
    return;
  }

  try {
    const departureDate = new Date();
    departureDate.setDate(departureDate.getDate() + 7);
    const probeDestination = key.includes('моск') ? 'Санкт-Петербург' : 'Москва';
    const result = await callTutuTool<TutuSearchResult>('search_multitransport', {
      origin: query,
      destination: probeDestination,
      departure_date: departureDate.toISOString().slice(0, 10),
      adults: 1,
      modes: ['etrain'],
      page: 1,
      page_size: 1,
      view: 'compact',
    });

    const resolved = result.meta?.from;
    const candidates = [resolved, ...(resolved?.also_named || [])].filter(
      (item): item is NonNullable<typeof item> => Boolean(item?.name),
    );
    const locations = candidates.map((item, index) => {
      const id = `tutu:${item.geo_id || `${key}:${index}`}`;
      const location: TravelLocation = {
        id,
        name: String(item.name),
        region: String(item.region || 'Направление Туту'),
        country: '',
        code: item.iata || undefined,
      };
      rememberResolvedLocation(id, location);
      return location;
    });

    rememberLocationQuery(key, locations);
    response.json({ locations, source: 'Tutu MCP' });
  } catch (error) {
    response.status(502).json({
      locations: [],
      source: 'Tutu MCP',
      error: upstreamMessage(error, 'Геопоиск временно недоступен'),
    });
  }
});

app.post('/api/search', async (request, response) => {
  const started = performance.now();

  try {
    const input = validateSearch(
      request.body as Partial<SearchPayload>,
      (id) => getTravelLocation(id) || resolvedLocations.get(id),
    );
    const responseCacheKey = { ...input, page: input.page || 1 };
    const mcpStarted = performance.now();
    const pageSizePerMode = 8;
    const searchMode = async (mode: TransportMode) => {
      const args: Record<string, unknown> = {
        origin: input.origin,
        destination: input.destination,
        departure_date: input.departureDate,
        adults: input.adults,
        modes: [mode],
        price_max: input.priceMax || null,
        direct_only: input.directOnly,
        optimize_for: input.priority === 'time' ? 'time' : 'price',
        page: input.page,
        page_size: pageSizePerMode,
        view: 'compact',
      };
      if (input.childrenAges.length) args.children_ages = input.childrenAges;

      try {
        return {
          mode,
          childrenSupported: true,
          result: await callTutuTool<TutuSearchResult>('search_multitransport', args),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (
          !input.childrenAges.length ||
          !/children_ages|extra inputs|validation|unexpected/i.test(message)
        )
          throw error;
        delete args.children_ages;
        return {
          mode,
          childrenSupported: false,
          result: await callTutuTool<TutuSearchResult>('search_multitransport', args),
        };
      }
    };

    // Источники независимы: ожидание медленного режима не должно откладывать
    // запуск остальных. Promise.allSettled сохраняет частичную выдачу, если
    // отдельный источник завершится ошибкой.
    const modeResults = await Promise.allSettled(input.modes.map(searchMode));
    const rawOffers: Parameters<typeof analyseOffers>[0] = [];
    const unavailable: NonNullable<SearchResponse['meta']['unavailable']> = [];
    const modePagination: NonNullable<SearchResponse['meta']['mode_pagination']> = {};
    let firstMeta: SearchResponse['meta'] | undefined;
    let successfulModes = 0;
    let childrenSupported = true;

    modeResults.forEach((settled, index) => {
      const mode = input.modes[index];
      if (settled.status === 'rejected') {
        unavailable.push({
          mode,
          reason: upstreamMessage(settled.reason),
        });
        modePagination[mode] = { returned: 0, has_more: false };
        return;
      }

      successfulModes += 1;
      childrenSupported &&= settled.value.childrenSupported;
      const result = settled.value.result;
      const variants = (result.variants || []) as Parameters<typeof analyseOffers>[0];
      rawOffers.push(...variants);
      firstMeta ||= result.meta;
      if (result.meta?.unavailable) {
        unavailable.push(
          ...result.meta.unavailable.filter(
            (entry) => typeof entry === 'string' || !entry.mode || entry.mode === mode,
          ),
        );
      }
      modePagination[mode] = {
        returned: variants.length,
        has_more: Boolean(result.meta?.has_more),
      };
    });

    if (!successfulModes) {
      const cached = await cache.read<SearchResponse>('transport', responseCacheKey);
      if (cached) {
        const cachedRawOffers = cached.data.variants.map(
          ({ analysis: _analysis, ...offer }) => offer,
        ) as Parameters<typeof analyseOffers>[0];
        const refreshed = analyseOffers(cachedRawOffers, input.priority);
        const recommendations = curateRecommendations(refreshed.offers).recommendations;
        response.json({
          ...cached.data,
          requestId: crypto.randomUUID(),
          variants: refreshed.offers,
          recommendations,
          meta: {
            ...cached.data.meta,
            is_cached: true,
            cached_at: cached.savedAt,
            scoring_version: TRANSPORT_SCORING_VERSION,
          },
        });
        return;
      }
      throw new Error(
        'Tutu MCP сейчас не отвечает. Мы сохраним последний успешный результат и автоматически используем его при следующем кратком сбое — попробуйте ещё раз через несколько секунд.',
      );
    }

    const scout: AgentStep = {
      id: 'scout',
      name: 'Разведчик',
      role: 'опрашивает Tutu MCP',
      detail: `Параллельно проверил ${input.modes.length} вида транспорта и получил ${rawOffers.length} реальных вариантов.`,
      durationMs: Math.round(performance.now() - mcpStarted),
    };
    const analysed = analyseOffers(rawOffers, input.priority);
    const curated = curateRecommendations(analysed.offers);

    const payload: SearchResponse = {
      requestId: crypto.randomUUID(),
      elapsedMs: Math.round(performance.now() - started),
      variants: analysed.offers,
      recommendations: curated.recommendations,
      agents: [scout, analysed.agent, curated.agent],
      meta: {
        ...(firstMeta || {}),
        unavailable: unavailable.length ? unavailable : undefined,
        total_returned: analysed.offers.length,
        has_more: Object.values(modePagination).some((mode) => mode?.has_more),
        page: input.page,
        page_size: pageSizePerMode,
        mode_pagination: modePagination,
        passenger_note:
          input.childrenAges.length && !childrenSupported
            ? 'Детские тарифы не поддерживаются общим поиском для части транспорта — итоговую цену нужно подтвердить на Туту.'
            : undefined,
        scoring_version: TRANSPORT_SCORING_VERSION,
      },
    };

    await cache.write('transport', responseCacheKey, payload).catch(() => undefined);
    response.json(payload);
  } catch (error) {
    sendPublicError(response, error, 'Не удалось найти варианты поездки');
  }
});

app.post('/api/hotels', async (request, response) => {
  const started = performance.now();
  try {
    const input = validateHotelSearch(request.body as Partial<HotelSearchPayload>);
    const responseCacheKey = { ...input, page: input.page || 1 };

    try {
      const result = await callTutuTool<TutuHotelSearchResult>('search_hotels', {
        city_name: input.cityName,
        check_in: input.checkIn,
        check_out: input.checkOut,
        adults: input.adults,
        children_ages: input.childrenAges,
        page: input.page,
        page_size: 16,
        stars: input.stars,
        price_max: input.priceMax,
        meals: input.meals,
        hotel_types: input.hotelTypes,
        min_rating: input.minRating,
        free_cancellation: input.freeCancellation,
        breakfast_included: input.breakfastIncluded,
        hotel_amenities: input.hotelAmenities,
        room_amenities: input.roomAmenities,
        view: 'compact',
      });
      const hotels = result.hotels || [];
      const payload: HotelSearchResponse = {
        requestId: crypto.randomUUID(),
        elapsedMs: Math.round(performance.now() - started),
        hotels,
        meta: {
          ...(result.meta || {}),
          total_returned: hotels.length,
          page: input.page,
          page_size: 16,
        },
      };
      await cache.write('hotels', responseCacheKey, payload).catch(() => undefined);
      response.json(payload);
    } catch (error) {
      const cached = await cache.read<HotelSearchResponse>('hotels', responseCacheKey);
      if (cached) {
        response.json({
          ...cached.data,
          requestId: crypto.randomUUID(),
          meta: { ...cached.data.meta, is_cached: true, cached_at: cached.savedAt },
        });
        return;
      }
      throw error;
    }
  } catch (error) {
    sendPublicError(response, error, 'Не удалось найти отели');
  }
});

app.post('/api/checkout-link', async (request, response) => {
  try {
    const checkoutRef = validateCheckoutRef(request.body?.checkoutRef);

    const link = await callTutuTool<{
      checkout_url?: string;
      search_results_url?: string;
      kind?: string;
      purchase_url_note?: string;
    }>('create_checkout_link', checkoutRef);

    if (!link.checkout_url) throw new Error('Tutu MCP не вернул ссылку на выбранный вариант');
    response.json(link);
  } catch (error) {
    sendPublicError(response, error, 'Не удалось открыть выбранный вариант');
  }
});

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API endpoint не найден' });
});

const distDir = path.resolve(process.cwd(), 'dist');
app.use(
  express.static(distDir, {
    etag: true,
    maxAge: '1h',
    setHeaders(response, file) {
      if (file.includes(`${path.sep}assets${path.sep}`)) {
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);
app.get('/{*path}', (_request, response) => {
  response.set('Cache-Control', 'no-cache');
  response.sendFile(path.join(distDir, 'index.html'), (error) => {
    if (error && !response.headersSent) response.status(404).end();
  });
});

app.use(errorBoundary);

function rememberResolvedLocation(id: string, location: TravelLocation): void {
  if (resolvedLocations.size >= 1_000) {
    const oldest = resolvedLocations.keys().next().value;
    if (oldest) resolvedLocations.delete(oldest);
  }
  resolvedLocations.set(id, location);
}

function rememberLocationQuery(key: string, locations: TravelLocation[]): void {
  const now = Date.now();
  for (const [candidate, entry] of locationQueries) {
    if (entry.expiresAt <= now) locationQueries.delete(candidate);
  }
  if (locationQueries.size >= 500) {
    const oldest = locationQueries.keys().next().value;
    if (oldest) locationQueries.delete(oldest);
  }
  locationQueries.set(key, { expiresAt: now + 60 * 60 * 1000, locations });
}
