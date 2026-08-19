import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface DatePickerProps {
  value: string;
  min: string;
  label?: string;
  onChange: (value: string) => void;
}

const weekdays = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function parseIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function toIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function monthLabel(date: Date) {
  const label = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(parseIso(value)).replace(".", "");
}

function MonthGrid({
  month,
  selected,
  minDate,
  onSelect,
}: {
  month: Date;
  selected: string;
  minDate: Date;
  onSelect: (date: Date) => void;
}) {
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(first);
      date.setDate(index - offset + 1);
      return date;
    });
  }, [month]);

  return (
    <div className="calendar-month">
      <strong>{monthLabel(month)}</strong>
      <div className="calendar-weekdays">
        {weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </div>
      <div className="calendar-days">
        {cells.map((date) => {
          const iso = toIso(date);
          const outside = date.getMonth() !== month.getMonth();
          const disabled = date < minDate || outside;
          return (
            <button
              className={`${iso === selected ? "is-selected" : ""} ${outside ? "is-outside" : ""}`}
              key={iso}
              type="button"
              disabled={disabled}
              aria-label={new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(date)}
              aria-pressed={iso === selected}
              onClick={() => onSelect(date)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DatePicker({ value, min, label = "Когда", onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(value);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = parseIso(value);
    return new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const minDate = parseIso(min);
  const firstAvailableMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1, 12);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  const selectDate = (date: Date) => setDraftDate(toIso(date));

  const applyDate = () => {
    onChange(draftDate);
    setOpen(false);
  };

  return (
    <div className={`search-field search-field--date picker-field ${open ? "is-open" : ""}`} ref={rootRef}>
      <span>{label}</span>
      <button
        className="picker-field__trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          const selected = parseIso(value);
          setDraftDate(value);
          setVisibleMonth(new Date(selected.getFullYear(), selected.getMonth(), 1, 12));
          setOpen((current) => !current);
        }}
      >
        <strong>{displayDate(value)}</strong>
        <CalendarDays size={19} />
      </button>

      {open && (
        <div className="calendar-popover" role="dialog" aria-label={`Выберите дату: ${label.toLowerCase()}`}>
          <button
            className="calendar-nav calendar-nav--prev"
            type="button"
            aria-label="Предыдущий месяц"
            disabled={visibleMonth <= firstAvailableMonth}
            onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="calendar-nav calendar-nav--next"
            type="button"
            aria-label="Следующий месяц"
            onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
          >
            <ChevronRight size={20} />
          </button>
          <div className="calendar-months">
            <MonthGrid month={visibleMonth} selected={draftDate} minDate={minDate} onSelect={selectDate} />
            <MonthGrid month={addMonths(visibleMonth, 1)} selected={draftDate} minDate={minDate} onSelect={selectDate} />
          </div>
          <div className="calendar-footer">
            <div className="calendar-quick">
              <span>Быстрый выбор</span>
              <button type="button" onClick={() => selectDate(minDate)}>Завтра</button>
              <button type="button" onClick={() => selectDate(addDays(minDate, 6))}>Через неделю</button>
            </div>
            <div className="calendar-actions">
              <button type="button" onClick={() => setDraftDate(min)}>Сбросить</button>
              <button className="calendar-actions__apply" type="button" onClick={applyDate}>Выбрать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
