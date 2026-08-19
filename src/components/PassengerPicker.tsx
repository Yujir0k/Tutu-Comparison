import { Baby, Minus, Plus, UsersRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface PassengerPickerProps {
  adults: number;
  childrenAges: number[];
  context?: 'transport' | 'hotel';
  onAdultsChange: (value: number) => void;
  onChildrenAgesChange: (value: number[]) => void;
}

function passengerWord(count: number, context: 'transport' | 'hotel') {
  if (context === 'hotel') {
    if (count === 1) return '1 гость';
    if (count >= 2 && count <= 4) return `${count} гостя`;
    return `${count} гостей`;
  }
  if (count === 1) return '1 пассажир';
  if (count >= 2 && count <= 4) return `${count} пассажира`;
  return `${count} пассажиров`;
}

function childAgeLabel(age: number) {
  if (age === 0) return 'Младше года';
  const last = age % 10;
  const lastTwo = age % 100;
  const word =
    last === 1 && lastTwo !== 11
      ? 'год'
      : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
        ? 'года'
        : 'лет';
  return `${age} ${word}`;
}

export function PassengerPicker({
  adults,
  childrenAges,
  context = 'transport',
  onAdultsChange,
  onChildrenAgesChange,
}: PassengerPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const total = adults + childrenAges.length;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  return (
    <div
      className={`search-field search-field--people picker-field passenger-picker ${open ? 'is-open' : ''}`}
      ref={rootRef}
    >
      <span>{context === 'hotel' ? 'Гости' : 'Кто едет'}</span>
      <button
        className="picker-field__trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <strong>{passengerWord(total, context)}</strong>
        <UsersRound size={19} />
      </button>

      {open && (
        <div
          className="passenger-popover"
          role="dialog"
          aria-label={context === 'hotel' ? 'Количество гостей' : 'Количество пассажиров'}
        >
          <div className="passenger-row">
            <div>
              <strong>Взрослые</strong>
              <small>От 12 лет</small>
            </div>
            <div className="passenger-counter">
              <button
                type="button"
                aria-label="Убрать взрослого"
                disabled={adults <= 1}
                onClick={() => onAdultsChange(adults - 1)}
              >
                <Minus size={18} />
              </button>
              <strong>{adults}</strong>
              <button
                type="button"
                aria-label="Добавить взрослого"
                disabled={adults >= 6 || total >= 8}
                onClick={() => onAdultsChange(adults + 1)}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {childrenAges.length > 0 && (
            <div className="passenger-children">
              {childrenAges.map((age, index) => (
                <div className="passenger-child" key={index}>
                  <span>
                    <Baby size={18} />
                  </span>
                  <label>
                    <strong>Ребёнок {index + 1}</strong>
                    <select
                      aria-label={`Возраст ребёнка ${index + 1}`}
                      value={age}
                      onChange={(event) => {
                        const next = [...childrenAges];
                        next[index] = Number(event.target.value);
                        onChildrenAgesChange(next);
                      }}
                    >
                      {Array.from({ length: 18 }, (_, childAge) => (
                        <option value={childAge} key={childAge}>
                          {childAgeLabel(childAge)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-label={`Удалить ребёнка ${index + 1}`}
                    onClick={() =>
                      onChildrenAgesChange(
                        childrenAges.filter((_, childIndex) => childIndex !== index),
                      )
                    }
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            className="passenger-add-child"
            type="button"
            disabled={childrenAges.length >= 4 || total >= 8}
            onClick={() => onChildrenAgesChange([...childrenAges, 7])}
          >
            <Baby size={18} /> Добавить ребёнка
          </button>
          <button className="passenger-ready" type="button" onClick={() => setOpen(false)}>
            Готово
          </button>
        </div>
      )}
    </div>
  );
}
