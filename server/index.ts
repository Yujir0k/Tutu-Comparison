import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { analyseOffers, curateRecommendations } from "./agents.js";
import { callTutuTool } from "./mcp.js";
import { getTravelLocation, type TravelLocation } from "../src/locations.js";
import { TRANSPORT_SCORING_VERSION } from '../src/scoring.js';
import type {
  AgentStep,
  HotelDetailsPayload,
  HotelDetailsResponse,
  HotelOffer,
  HotelSearchPayload,
  HotelSearchResponse,
  Priority,
  SearchPayload,
  SearchResponse,
  TransportMode,
} from "../src/types.js";

interface TutuSearchResult {
  variants?: Array<Record<string, unknown>>;
  meta?: SearchResponse["meta"];
}

interface TutuHotelSearchResult {
  hotels?: HotelOffer[];
  meta?: HotelSearchResponse["meta"];
}

type TutuHotelDetailsResult = HotelDetailsResponse;

const app = express();
const port = Number(process.env.PORT || 8787);
const allowedModes = new Set<TransportMode>(["avia", "railway", "bus", "etrain"]);
const allowedPriorities = new Set<Priority>(["balance", "price", "time", "calm"]);
const resolvedLocations = new Map<string, TravelLocation>();
const locationQueries = new Map<string, { expiresAt: number; locations: TravelLocation[] }>();
const cacheDir = path.resolve(process.cwd(), ".tutu-cache");

function cacheKey(namespace: string, value: unknown) {
  return `${namespace}-${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}.json`;
}

async function readCache<T>(namespace: string, value: unknown, maxAgeMs = 30 * 60 * 1000) {
  try {
    const file = path.join(cacheDir, cacheKey(namespace, value));
    const entry = JSON.parse(await fs.readFile(file, "utf8")) as { savedAt: string; data: T };
    if (Date.now() - new Date(entry.savedAt).getTime() > maxAgeMs) return null;
    return entry;
  } catch {
    return null;
  }
}

async function writeCache<T>(namespace: string, value: unknown, data: T) {
  await fs.mkdir(cacheDir, { recursive: true });
  const file = path.join(cacheDir, cacheKey(namespace, value));
  await fs.writeFile(file, JSON.stringify({ savedAt: new Date().toISOString(), data }), "utf8");
}

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "calm-route-api" });
});

app.get("/api/locations", async (request, response) => {
  const query = String(request.query.q || "").trim();
  if (query.length < 2 || query.length > 80) {
    response.json({ locations: [] });
    return;
  }

  const key = query.toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
  const cached = locationQueries.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    response.json({ locations: cached.locations, source: "Tutu MCP" });
    return;
  }

  try {
    const departureDate = new Date();
    departureDate.setDate(departureDate.getDate() + 7);
    const probeDestination = key.includes("моск") ? "Санкт-Петербург" : "Москва";
    const result = await callTutuTool<TutuSearchResult>("search_multitransport", {
      origin: query,
      destination: probeDestination,
      departure_date: departureDate.toISOString().slice(0, 10),
      adults: 1,
      modes: ["etrain"],
      page: 1,
      page_size: 1,
      view: "compact",
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
        region: String(item.region || "Направление Туту"),
        country: "",
        code: item.iata || undefined,
      };
      resolvedLocations.set(id, location);
      return location;
    });

    locationQueries.set(key, { expiresAt: Date.now() + 60 * 60 * 1000, locations });
    response.json({ locations, source: "Tutu MCP" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Геопоиск временно недоступен";
    response.status(502).json({ locations: [], source: "Tutu MCP", error: message });
  }
});

app.post("/api/search", async (request, response) => {
  const started = performance.now();

  try {
    const input = validateSearch(request.body as Partial<SearchPayload>);
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
        optimize_for: input.priority === "time" ? "time" : "price",
        page: input.page,
        page_size: pageSizePerMode,
        view: "compact",
      };
      if (input.childrenAges.length) args.children_ages = input.childrenAges;

      try {
        return {
          mode,
          childrenSupported: true,
          result: await callTutuTool<TutuSearchResult>("search_multitransport", args),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!input.childrenAges.length || !/children_ages|extra inputs|validation|unexpected/i.test(message)) throw error;
        delete args.children_ages;
        return {
          mode,
          childrenSupported: false,
          result: await callTutuTool<TutuSearchResult>("search_multitransport", args),
        };
      }
    };

    // Источники независимы: ожидание медленного режима не должно откладывать
    // запуск остальных. Promise.allSettled сохраняет частичную выдачу, если
    // отдельный источник завершится ошибкой.
    const modeResults = await Promise.allSettled(input.modes.map(searchMode));
    const rawOffers: Parameters<typeof analyseOffers>[0] = [];
    const unavailable: NonNullable<SearchResponse["meta"]["unavailable"]> = [];
    const modePagination: NonNullable<SearchResponse["meta"]["mode_pagination"]> = {};
    let firstMeta: SearchResponse["meta"] | undefined;
    let successfulModes = 0;
    let childrenSupported = true;

    modeResults.forEach((settled, index) => {
      const mode = input.modes[index];
      if (settled.status === "rejected") {
        unavailable.push({
          mode,
          reason: settled.reason instanceof Error ? settled.reason.message : "Источник временно недоступен",
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
        unavailable.push(...result.meta.unavailable.filter((entry) => (
          typeof entry === 'string' || !entry.mode || entry.mode === mode
        )));
      }
      modePagination[mode] = {
        returned: variants.length,
        has_more: Boolean(result.meta?.has_more),
      };
    });

    if (!successfulModes) {
      const cached = await readCache<SearchResponse>("transport", responseCacheKey);
      if (cached) {
        const cachedRawOffers = cached.data.variants.map(({ analysis: _analysis, ...offer }) => offer) as Parameters<typeof analyseOffers>[0];
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
      throw new Error("Tutu MCP сейчас не отвечает. Мы сохраним последний успешный результат и автоматически используем его при следующем кратком сбое — попробуйте ещё раз через несколько секунд.");
    }

    const scout: AgentStep = {
      id: "scout",
      name: "Разведчик",
      role: "опрашивает Tutu MCP",
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
        passenger_note: input.childrenAges.length && !childrenSupported
          ? "Детские тарифы не поддерживаются общим поиском для части транспорта — итоговую цену нужно подтвердить на Туту."
          : undefined,
        scoring_version: TRANSPORT_SCORING_VERSION,
      },
    };

    await writeCache("transport", responseCacheKey, payload).catch(() => undefined);
    response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    const status = message.startsWith("Проверьте") ? 400 : 502;
    response.status(status).json({ error: message });
  }
});

app.post("/api/hotels", async (request, response) => {
  const started = performance.now();
  try {
    const input = validateHotelSearch(request.body as Partial<HotelSearchPayload>);
    const responseCacheKey = { ...input, page: input.page || 1 };

    try {
      const result = await callTutuTool<TutuHotelSearchResult>("search_hotels", {
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
        view: "compact",
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
      await writeCache("hotels", responseCacheKey, payload).catch(() => undefined);
      response.json(payload);
    } catch (error) {
      const cached = await readCache<HotelSearchResponse>("hotels", responseCacheKey);
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
    const message = error instanceof Error ? error.message : "Не удалось найти отели";
    const status = message.startsWith("Проверьте") ? 400 : 502;
    response.status(status).json({ error: message });
  }
});

app.post('/api/hotel-details', async (request, response) => {
  try {
    const input = validateHotelDetails(request.body as Partial<HotelDetailsPayload>);
    const responseCacheKey = input;

    try {
      const details = await callTutuTool<TutuHotelDetailsResult>('get_offer_details', {
        product_type: 'hotels',
        hotel_id: input.hotelId,
        check_in: input.checkIn,
        check_out: input.checkOut,
        adults: input.adults,
        children_ages: input.childrenAges,
        view: 'compact',
      });
      await writeCache('hotel-details', responseCacheKey, details).catch(() => undefined);
      response.json(details);
    } catch (error) {
      const cached = await readCache<HotelDetailsResponse>('hotel-details', responseCacheKey, 10 * 60 * 1000);
      if (cached) {
        response.json(cached.data);
        return;
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось получить доступные номера';
    const status = message.startsWith('Проверьте') ? 400 : 502;
    response.status(status).json({ error: message });
  }
});

app.post("/api/checkout-link", async (request, response) => {
  try {
    const checkoutRef = request.body?.checkoutRef;
    if (!checkoutRef || typeof checkoutRef !== "object" || Array.isArray(checkoutRef)) {
      response.status(400).json({ error: "Не хватает данных выбранного предложения" });
      return;
    }

    const transport = String((checkoutRef as Record<string, unknown>).transport || "");
    if (transport !== 'hotels' && !allowedModes.has(transport as TransportMode)) {
      response.status(400).json({ error: "Неизвестный вид транспорта" });
      return;
    }

    const link = await callTutuTool<{
      checkout_url?: string;
      search_results_url?: string;
      kind?: string;
      purchase_url_note?: string;
    }>("create_checkout_link", checkoutRef as Record<string, unknown>);

    if (!link.checkout_url) throw new Error("Tutu MCP не вернул ссылку на выбранный вариант");
    response.json(link);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось открыть выбранный вариант";
    response.status(502).json({ error: message });
  }
});

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(currentDir, "../dist");
app.use(express.static(distDir));
app.get("/{*path}", (_request, response) => {
  response.sendFile(path.join(distDir, "index.html"), (error) => {
    if (error && !response.headersSent) response.status(404).end();
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Путь API: http://127.0.0.1:${port}`);
});

function validateSearch(body: Partial<SearchPayload>): SearchPayload {
  const origin = String(body.origin || "").trim();
  const destination = String(body.destination || "").trim();
  const originId = String(body.originId || "").trim();
  const destinationId = String(body.destinationId || "").trim();
  const departureDate = String(body.departureDate || "").trim();
  const adults = Number(body.adults || 1);
  const childrenAges = Array.isArray(body.childrenAges)
    ? body.childrenAges.map(Number)
    : [];
  const priority = body.priority || "balance";
  const priceMax = body.priceMax ? Number(body.priceMax) : undefined;
  const page = Number(body.page || 1);
  const modes = Array.isArray(body.modes)
    ? body.modes.filter((mode): mode is TransportMode => allowedModes.has(mode))
    : [];

  const originLocation = getTravelLocation(originId) || resolvedLocations.get(originId);
  const destinationLocation = getTravelLocation(destinationId) || resolvedLocations.get(destinationId);
  if (!originLocation || originLocation.name !== origin) {
    throw new Error("Проверьте город отправления: выберите его из списка");
  }
  if (!destinationLocation || destinationLocation.name !== destination) {
    throw new Error("Проверьте город прибытия: выберите его из списка");
  }
  if (originId === destinationId) {
    throw new Error("Проверьте маршрут: города должны отличаться");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) {
    throw new Error("Проверьте дату отправления");
  }
  if (!Number.isInteger(adults) || adults < 1 || adults > 8) {
    throw new Error("Проверьте количество путешественников");
  }
  if (childrenAges.length > 4 || childrenAges.some((age) => !Number.isInteger(age) || age < 0 || age > 17) || adults + childrenAges.length > 8) {
    throw new Error("Проверьте возраст и количество детей");
  }
  if (!allowedPriorities.has(priority)) {
    throw new Error("Проверьте выбранный приоритет");
  }
  if (priceMax !== undefined && (!Number.isFinite(priceMax) || priceMax < 0)) {
    throw new Error("Проверьте максимальную цену");
  }
  if (!modes.length) throw new Error("Выберите хотя бы один вид транспорта");
  if (!Number.isInteger(page) || page < 1 || page > 10) {
    throw new Error("Проверьте номер страницы выдачи");
  }

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
    directOnly: Boolean(body.directOnly),
    modes,
    page,
  };
}

function validateHotelSearch(body: Partial<HotelSearchPayload>): HotelSearchPayload {
  const cityName = String(body.cityName || "").trim();
  const checkIn = String(body.checkIn || "").trim();
  const checkOut = String(body.checkOut || "").trim();
  const adults = Number(body.adults || 1);
  const childrenAges = Array.isArray(body.childrenAges) ? body.childrenAges.map(Number) : [];
  const page = Number(body.page || 1);
  const stars = Array.isArray(body.stars)
    ? Array.from(new Set(body.stars.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 5)))
    : undefined;
  const priceMax = body.priceMax ? Number(body.priceMax) : undefined;
  const meals = cleanHotelFilterValues(body.meals, new Set(['breakfast', 'halfboard', 'allinclusive', 'fullboard', 'lunch', 'dinner', 'nomeal']));
  const hotelTypes = cleanHotelFilterValues(body.hotelTypes, new Set(['hotel', 'apartments', 'hostel', 'aparthotel', 'guesthouse', 'cottage']));
  const minRating = body.minRating ? Number(body.minRating) : undefined;
  const hotelAmenities = cleanHotelFilterValues(body.hotelAmenities, new Set(['pool', 'parking', 'wifi', 'spa', 'transfer', 'kid_friendly', 'pet_friendly', 'kitchen', 'fitness', 'sauna', 'jacuzzi', 'aquapark', 'kids_pool', 'beach', 'elevator', 'minibar', 'fridge', 'buffet']));
  const roomAmenities = cleanHotelFilterValues(body.roomAmenities, new Set(['sea_view', 'mountain_view', 'view', 'balcony', 'air_conditioner', 'private_bath', 'room_wifi', 'room_kitchen', 'workspace']));

  if (cityName.length < 2 || cityName.length > 80) throw new Error("Проверьте город проживания");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) {
    throw new Error("Проверьте даты заезда и выезда");
  }
  if (!Number.isInteger(adults) || adults < 1 || adults > 6) throw new Error("Проверьте количество взрослых");
  if (childrenAges.length > 4 || childrenAges.some((age) => !Number.isInteger(age) || age < 0 || age > 17)) {
    throw new Error("Проверьте возраст и количество детей");
  }
  if (!Number.isInteger(page) || page < 1 || page > 10) throw new Error("Проверьте номер страницы выдачи");
  if (priceMax !== undefined && (!Number.isFinite(priceMax) || priceMax < 1 || priceMax > 10_000_000)) throw new Error('Проверьте максимальную цену');
  if (minRating !== undefined && ![7, 8, 9].includes(minRating)) throw new Error('Проверьте минимальный рейтинг');

  return {
    cityName,
    checkIn,
    checkOut,
    adults,
    childrenAges,
    page,
    stars: stars?.length ? stars : undefined,
    priceMax,
    meals,
    hotelTypes,
    minRating,
    freeCancellation: body.freeCancellation === true ? true : undefined,
    breakfastIncluded: body.breakfastIncluded === true ? true : undefined,
    hotelAmenities,
    roomAmenities,
  };
}

function cleanHotelFilterValues(values: unknown, allowed: Set<string>) {
  if (!Array.isArray(values)) return undefined;
  const cleaned = Array.from(new Set(values.map(String).filter((value) => allowed.has(value))));
  return cleaned.length ? cleaned : undefined;
}

function validateHotelDetails(body: Partial<HotelDetailsPayload>): HotelDetailsPayload {
  const hotelId = String(body.hotelId || '').trim();
  const checkIn = String(body.checkIn || '').trim();
  const checkOut = String(body.checkOut || '').trim();
  const adults = Number(body.adults || 1);
  const childrenAges = Array.isArray(body.childrenAges) ? body.childrenAges.map(Number) : [];

  if (!/^\d{1,20}$/.test(hotelId)) throw new Error('Проверьте выбранный отель');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) {
    throw new Error('Проверьте даты заезда и выезда');
  }
  if (!Number.isInteger(adults) || adults < 1 || adults > 6) throw new Error('Проверьте количество взрослых');
  if (childrenAges.length > 4 || childrenAges.some((age) => !Number.isInteger(age) || age < 0 || age > 17)) {
    throw new Error('Проверьте возраст и количество детей');
  }

  return { hotelId, checkIn, checkOut, adults, childrenAges };
}
