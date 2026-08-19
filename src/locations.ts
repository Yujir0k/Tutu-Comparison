export interface TravelLocation {
  id: string;
  name: string;
  region: string;
  country: string;
  code?: string;
  aliases?: string[];
  popular?: boolean;
}

const russianCities: Array<Omit<TravelLocation, "country">> = [
  { id: "moscow", name: "Москва", region: "Москва", code: "MOW", popular: true },
  { id: "saint-petersburg", name: "Санкт-Петербург", region: "Санкт-Петербург", code: "LED", aliases: ["Питер", "СПб"], popular: true },
  { id: "kazan", name: "Казань", region: "Республика Татарстан", code: "KZN", popular: true },
  { id: "sochi", name: "Сочи", region: "Краснодарский край", code: "AER", popular: true },
  { id: "kaliningrad", name: "Калининград", region: "Калининградская область", code: "KGD", popular: true },
  { id: "yekaterinburg", name: "Екатеринбург", region: "Свердловская область", code: "SVX", aliases: ["Екат"] },
  { id: "novosibirsk", name: "Новосибирск", region: "Новосибирская область", code: "OVB" },
  { id: "nizhny-novgorod", name: "Нижний Новгород", region: "Нижегородская область", code: "GOJ", aliases: ["Нижний"] },
  { id: "ufa", name: "Уфа", region: "Республика Башкортостан", code: "UFA" },
  { id: "samara", name: "Самара", region: "Самарская область", code: "KUF" },
  { id: "krasnodar", name: "Краснодар", region: "Краснодарский край", code: "KRR" },
  { id: "rostov-on-don", name: "Ростов-на-Дону", region: "Ростовская область", code: "ROV", aliases: ["Ростов"] },
  { id: "chelyabinsk", name: "Челябинск", region: "Челябинская область", code: "CEK" },
  { id: "omsk", name: "Омск", region: "Омская область", code: "OMS" },
  { id: "perm", name: "Пермь", region: "Пермский край", code: "PEE" },
  { id: "volgograd", name: "Волгоград", region: "Волгоградская область", code: "VOG" },
  { id: "krasnoyarsk", name: "Красноярск", region: "Красноярский край", code: "KJA" },
  { id: "voronezh", name: "Воронеж", region: "Воронежская область", code: "VOZ" },
  { id: "saratov", name: "Саратов", region: "Саратовская область", code: "GSV" },
  { id: "tyumen", name: "Тюмень", region: "Тюменская область", code: "TJM" },
  { id: "irkutsk", name: "Иркутск", region: "Иркутская область", code: "IKT" },
  { id: "khabarovsk", name: "Хабаровск", region: "Хабаровский край", code: "KHV" },
  { id: "vladivostok", name: "Владивосток", region: "Приморский край", code: "VVO" },
  { id: "yaroslavl", name: "Ярославль", region: "Ярославская область", code: "IAR" },
  { id: "tomsk", name: "Томск", region: "Томская область", code: "TOF" },
  { id: "makhachkala", name: "Махачкала", region: "Республика Дагестан", code: "MCX" },
  { id: "orenburg", name: "Оренбург", region: "Оренбургская область", code: "REN" },
  { id: "kemerovo", name: "Кемерово", region: "Кемеровская область", code: "KEJ" },
  { id: "novokuznetsk", name: "Новокузнецк", region: "Кемеровская область", code: "NOZ" },
  { id: "ryazan", name: "Рязань", region: "Рязанская область", code: "RZN" },
  { id: "astrakhan", name: "Астрахань", region: "Астраханская область", code: "ASF" },
  { id: "naberezhnye-chelny", name: "Набережные Челны", region: "Республика Татарстан", code: "NBC" },
  { id: "penza", name: "Пенза", region: "Пензенская область", code: "PEZ" },
  { id: "lipetsk", name: "Липецк", region: "Липецкая область", code: "LPK" },
  { id: "kirov", name: "Киров", region: "Кировская область", code: "KVX" },
  { id: "cheboksary", name: "Чебоксары", region: "Чувашская Республика", code: "CSY" },
  { id: "tula", name: "Тула", region: "Тульская область" },
  { id: "kaluga", name: "Калуга", region: "Калужская область", code: "KLF" },
  { id: "kursk", name: "Курск", region: "Курская область", code: "URS" },
  { id: "bryansk", name: "Брянск", region: "Брянская область", code: "BZK" },
  { id: "ivanovo", name: "Иваново", region: "Ивановская область", code: "IWA" },
  { id: "tver", name: "Тверь", region: "Тверская область" },
  { id: "belgorod", name: "Белгород", region: "Белгородская область", code: "EGO" },
  { id: "stavropol", name: "Ставрополь", region: "Ставропольский край", code: "STW" },
  { id: "mineralnye-vody", name: "Минеральные Воды", region: "Ставропольский край", code: "MRV", aliases: ["Минводы"] },
  { id: "pyatigorsk", name: "Пятигорск", region: "Ставропольский край" },
  { id: "kislovodsk", name: "Кисловодск", region: "Ставропольский край" },
  { id: "vladikavkaz", name: "Владикавказ", region: "Республика Северная Осетия", code: "OGZ" },
  { id: "grozny", name: "Грозный", region: "Чеченская Республика", code: "GRV" },
  { id: "murmansk", name: "Мурманск", region: "Мурманская область", code: "MMK" },
  { id: "arkhangelsk", name: "Архангельск", region: "Архангельская область", code: "ARH" },
  { id: "petrozavodsk", name: "Петрозаводск", region: "Республика Карелия", code: "PES" },
  { id: "pskov", name: "Псков", region: "Псковская область", code: "PKV" },
  { id: "veliky-novgorod", name: "Великий Новгород", region: "Новгородская область", aliases: ["Новгород"] },
  { id: "vologda", name: "Вологда", region: "Вологодская область", code: "VGD" },
  { id: "cherepovets", name: "Череповец", region: "Вологодская область", code: "CEE" },
  { id: "izhevsk", name: "Ижевск", region: "Удмуртская Республика", code: "IJK" },
  { id: "ulyanovsk", name: "Ульяновск", region: "Ульяновская область", code: "ULY" },
  { id: "saransk", name: "Саранск", region: "Республика Мордовия", code: "SKX" },
  { id: "yoshkar-ola", name: "Йошкар-Ола", region: "Республика Марий Эл", code: "JOK" },
  { id: "tambov", name: "Тамбов", region: "Тамбовская область", code: "TBW" },
  { id: "barnaul", name: "Барнаул", region: "Алтайский край", code: "BAX" },
  { id: "gorno-altaysk", name: "Горно-Алтайск", region: "Республика Алтай", code: "RGK" },
  { id: "abakan", name: "Абакан", region: "Республика Хакасия", code: "ABA" },
  { id: "ulan-ude", name: "Улан-Удэ", region: "Республика Бурятия", code: "UUD" },
  { id: "chita", name: "Чита", region: "Забайкальский край", code: "HTA" },
  { id: "yakutsk", name: "Якутск", region: "Республика Саха", code: "YKS" },
  { id: "blagoveshchensk", name: "Благовещенск", region: "Амурская область", code: "BQS" },
  { id: "yuzhno-sakhalinsk", name: "Южно-Сахалинск", region: "Сахалинская область", code: "UUS" },
  { id: "magadan", name: "Магадан", region: "Магаданская область", code: "GDX" },
  { id: "anapa", name: "Анапа", region: "Краснодарский край", code: "AAQ" },
  { id: "gelendzhik", name: "Геленджик", region: "Краснодарский край", code: "GDZ" },
  { id: "novorossiysk", name: "Новороссийск", region: "Краснодарский край" },
  { id: "adler", name: "Адлер", region: "Краснодарский край", code: "AER" },
  { id: "simferopol", name: "Симферополь", region: "Республика Крым", code: "SIP" },
  { id: "sevastopol", name: "Севастополь", region: "Севастополь" },
  { id: "surgut", name: "Сургут", region: "Ханты-Мансийский АО", code: "SGC" },
  { id: "nizhnevartovsk", name: "Нижневартовск", region: "Ханты-Мансийский АО", code: "NJC" },
  { id: "khanty-mansiysk", name: "Ханты-Мансийск", region: "Ханты-Мансийский АО", code: "HMA" },
];

const nearbyCities: TravelLocation[] = [
  { id: "minsk", name: "Минск", region: "Минская область", country: "Беларусь", code: "MSQ" },
  { id: "brest", name: "Брест", region: "Брестская область", country: "Беларусь", code: "BQT" },
  { id: "gomel", name: "Гомель", region: "Гомельская область", country: "Беларусь", code: "GME" },
  { id: "astana", name: "Астана", region: "Астана", country: "Казахстан", code: "NQZ" },
  { id: "almaty", name: "Алматы", region: "Алматы", country: "Казахстан", code: "ALA" },
  { id: "tashkent", name: "Ташкент", region: "Ташкент", country: "Узбекистан", code: "TAS" },
  { id: "bishkek", name: "Бишкек", region: "Бишкек", country: "Кыргызстан", code: "FRU" },
  { id: "yerevan", name: "Ереван", region: "Ереван", country: "Армения", code: "EVN" },
  { id: "baku", name: "Баку", region: "Баку", country: "Азербайджан", code: "GYD" },
  { id: "tbilisi", name: "Тбилиси", region: "Тбилиси", country: "Грузия", code: "TBS" },
  { id: "istanbul", name: "Стамбул", region: "Стамбул", country: "Турция", code: "IST" },
  { id: "antalya", name: "Анталья", region: "Анталья", country: "Турция", code: "AYT" },
  { id: "dubai", name: "Дубай", region: "Дубай", country: "ОАЭ", code: "DXB" },
];

export const travelLocations: TravelLocation[] = [
  ...russianCities.map((city) => ({ ...city, country: "Россия" })),
  ...nearbyCities,
];

export function normalizeLocationQuery(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
}

export function getTravelLocation(id?: string | null) {
  return travelLocations.find((location) => location.id === id);
}

export function isSelectedLocation(id: string | undefined, name: string) {
  const location = getTravelLocation(id);
  return Boolean(location && location.name === name);
}

export function isConfirmedLocation(id: string | undefined, name: string) {
  return Boolean(id && name.trim() && (id.startsWith("tutu:") || isSelectedLocation(id, name)));
}

export function searchTravelLocations(query: string, excludeId?: string | null, limit = 8) {
  const normalized = normalizeLocationQuery(query);
  return travelLocations
    .filter((location) => location.id !== excludeId)
    .map((location) => {
      const searchable = [location.name, location.region, location.country, location.code, ...(location.aliases || [])]
        .filter(Boolean)
        .map((value) => normalizeLocationQuery(String(value)));
      const prefix = searchable.some((value) => value.startsWith(normalized));
      const includes = searchable.some((value) => value.includes(normalized));
      return { location, prefix, includes };
    })
    .filter(({ location, includes }) => normalized ? includes : Boolean(location.popular))
    .sort((a, b) => Number(b.prefix) - Number(a.prefix) || Number(Boolean(b.location.popular)) - Number(Boolean(a.location.popular)) || a.location.name.localeCompare(b.location.name, "ru"))
    .slice(0, limit)
    .map(({ location }) => location);
}
