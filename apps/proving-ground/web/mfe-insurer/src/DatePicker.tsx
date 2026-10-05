import { useState } from "react";
import s from "./App.module.css";
import { useCms } from "./support";

// A custom, div-only date picker (LO-18): no native input, no roles, nothing to type into.
interface Props {
  value: string;
  onChange: (iso: string) => void;
  /** First month shown, "YYYY-MM-DD". */
  start: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function DatePicker({ value, onChange, start }: Props) {
  const t = useCms();
  const [open, setOpen] = useState(false);
  const first = (value || start).split("-").map(Number);
  const [year, setYear] = useState(first[0] ?? 2026);
  const [month, setMonth] = useState((first[1] ?? 1) - 1);

  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: count }, (_, i) => i + 1),
  ];
  const shift = (d: number) => {
    const m = month + d;
    setYear(year + Math.floor(m / 12));
    setMonth(((m % 12) + 12) % 12);
  };

  return (
    <div className={`${s.picker} _x7 mk-dp-1c4__root`}>
      <div className={`${s.pickerValue} _x2 mk-dp-1c4__value`} onClick={() => setOpen(!open)}>
        {value || t("addons.pick")}
      </div>
      {open && (
        <div className={`${s.calendar} _x3 mk-dp-1c4__pop`}>
          <div className={s.calHead}>
            <div className={s.calDay} onClick={() => shift(-1)}>
              {t("calendar.prev")}
            </div>
            <div>
              {year}-{pad(month + 1)}
            </div>
            <div className={s.calDay} onClick={() => shift(1)}>
              {t("calendar.next")}
            </div>
          </div>
          <div className={s.calGrid}>
            {t("calendar.days")
              .split(",")
              .map((d) => (
                <div key={d} className={s.calHeadDay}>
                  {d}
                </div>
              ))}
            {cells.map((d, i) => {
              if (d === null) return <div key={`e${i}`} />;
              const iso = `${year}-${pad(month + 1)}-${pad(d)}`;
              return (
                <div
                  key={iso}
                  className={`${s.calDay} ${iso === value ? s.calSel : ""} _x4`}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                >
                  {d}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
