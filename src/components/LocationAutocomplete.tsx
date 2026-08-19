import { Check, MapPin, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { searchTravelLocations, type TravelLocation } from "../locations";

interface LocationAutocompleteProps {
  className: string;
  label: string;
  value: string;
  selectedId?: string;
  excludeId?: string;
  onInput: (value: string) => void;
  onSelect: (location: TravelLocation) => void;
}

export function LocationAutocomplete({
  className,
  label,
  value,
  selectedId,
  excludeId,
  onInput,
  onSelect,
}: LocationAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [remoteOptions, setRemoteOptions] = useState<TravelLocation[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const localOptions = useMemo(() => searchTravelLocations(value, excludeId), [excludeId, value]);
  const options = useMemo(() => {
    const seen = new Set<string>();
    return [...remoteOptions, ...localOptions]
      .filter((location) => location.id !== excludeId)
      .filter((location) => {
        const key = `${location.name.toLocaleLowerCase("ru-RU")}|${location.region.toLocaleLowerCase("ru-RU")}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 9);
  }, [excludeId, localOptions, remoteOptions]);
  const listId = `location-${label === "Откуда" ? "from" : "to"}`;

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2 || selectedId) {
      setRemoteOptions([]);
      setLoadingRemote(false);
      return;
    }

    setRemoteOptions([]);
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoadingRemote(true);
      try {
        const response = await fetch(`/api/locations?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as { locations?: TravelLocation[] };
        if (response.ok) setRemoteOptions(data.locations || []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRemoteOptions([]);
      } finally {
        if (!controller.signal.aborted) setLoadingRemote(false);
      }
    }, 320);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [selectedId, value]);

  const choose = (location: TravelLocation) => {
    onSelect(location);
    setOpen(false);
    setActiveIndex(0);
  };

  return (
    <div className={`search-field location-field ${className} ${open ? "is-open" : ""} ${value && !selectedId ? "is-unconfirmed" : ""}`}>
      <span>{label}</span>
      <input
        value={value}
        autoComplete="off"
        aria-label={label}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-invalid={Boolean(value && !selectedId)}
        role="combobox"
        onFocus={() => {
          setOpen(true);
          setActiveIndex(0);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          onInput(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => Math.min(current + 1, Math.max(options.length - 1, 0)));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(current - 1, 0));
          }
          if (event.key === "Enter" && open) {
            event.preventDefault();
            if (options[activeIndex]) choose(options[activeIndex]);
          }
          if (event.key === "Escape") setOpen(false);
        }}
      />

      {open && (
        <div className="location-dropdown" id={listId} role="listbox" aria-label={`Подсказки: ${label.toLowerCase()}`}>
          <div className="location-dropdown__title">
            {loadingRemote ? "Ищем в Туту…" : value.trim() ? "Города и транспортные узлы" : "Популярные направления"}
          </div>
          {options.length ? options.map((location, index) => (
            <button
              className={index === activeIndex ? "is-active" : ""}
              key={location.id}
              type="button"
              role="option"
              aria-selected={location.id === selectedId}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(location)}
            >
              <span className="location-option__icon"><MapPin size={18} /></span>
              <span className="location-option__text">
                <strong>{location.name}</strong>
                <small>{[location.region !== location.name ? location.region : null, location.country].filter(Boolean).join(", ")}</small>
              </span>
              {location.code && <span className="location-option__code">{location.code}</span>}
              {location.id === selectedId && <Check className="location-option__check" size={18} />}
            </button>
          )) : (
            <div className="location-dropdown__empty">
              <Search size={22} />
              <div>
                <strong>{loadingRemote ? "Ищем направление…" : "Туту не нашёл это направление"}</strong>
                <small>{loadingRemote ? 'Ищем подходящие места' : 'Уточните название города, вокзала или аэропорта'}</small>
              </div>
            </div>
          )}
          <div className="location-dropdown__hint">Выберите подходящее место из списка</div>
        </div>
      )}
    </div>
  );
}
