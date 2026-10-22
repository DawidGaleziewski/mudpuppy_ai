import { useEffect, useState } from "react";
import styles from "./App.module.css";

const KEY = "pg-cookies";

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * The cookie banner, released as its own micro-frontend (LO-38): an overlay on first visit that
 * stays until a choice is stored. MudPuppy dismisses it through the portal's obstacles config.
 */
export function App() {
  const [choice, setChoice] = useState<string | null>(read());
  const [t, setT] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/cms/shell/pl.json")
      .then((r) => r.json())
      .then(setT)
      .catch(() => undefined);
  }, []);
  if (choice) return null;
  const pick = (v: string) => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* private mode: banner returns next visit */
    }
    setChoice(v);
  };
  const k = (key: string) => t[key] ?? key;
  return (
    <div className={`${styles.banner} ck-b4nr _fx _z8`} id="cookie-banner">
      <p className={styles.text}>{k("cookies.text")}</p>
      <div className={styles.actions}>
        <button type="button" className={`${styles.primary} ck-acc _b1`} onClick={() => pick("all")}>
          {k("cookies.accept")}
        </button>
        <button type="button" className={`${styles.secondary} ck-nec _b2`} onClick={() => pick("necessary")}>
          {k("cookies.necessary")}
        </button>
      </div>
    </div>
  );
}
