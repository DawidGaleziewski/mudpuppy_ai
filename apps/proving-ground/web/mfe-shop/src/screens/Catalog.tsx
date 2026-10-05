import { useEffect, useState } from "react";
import { Art, gql, Link, money, useCms, useCtx, useTitle, type Category, type Product } from "../lib";
import styles from "../App.module.css";

interface CatalogData {
  catalog: { products: Product[]; page: number; hasNext: boolean; categories: Category[] };
}

// LO-18: dropdowns built from divs, no native select, no roles.
function Dropdown(props: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = props.options.find((o) => o.value === props.value);
  return (
    <div className={`${styles.dd} _dd1`}>
      <div className={styles.ddHead} onClick={() => setOpen(!open)}>
        {current?.label ?? props.options[0]?.label} <span>▾</span>
      </div>
      {open && (
        <div className={styles.ddList}>
          {props.options.map((o) => (
            <div
              key={o.value}
              className={styles.ddItem}
              onClick={() => {
                props.onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Hero() {
  const t = useCms();
  const [variant] = useState<"A" | "B">(() => {
    try {
      const v = sessionStorage.getItem("pg-shop-hero");
      if (v === "A" || v === "B") return v;
      const n = Math.random() < 0.5 ? "A" : "B";
      sessionStorage.setItem("pg-shop-hero", n);
      return n;
    } catch {
      return "A";
    }
  });
  const k = variant.toLowerCase();
  return (
    <section className={`${styles.hero} ${variant === "A" ? styles.heroA : styles.heroB}`}>
      <h1>{t(`hero.${k}.title`)}</h1>
      <p>{t(`hero.${k}.text`)}</p>
      <Link to="/sklep?sort=cena_rosnaco" className={styles.btn}>
        {t("hero.cta")}
      </Link>
    </section>
  );
}

function Newsletter() {
  const t = useCms();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("pg-shop-news") === "1";
    } catch {
      /* ignore */
    }
    if (seen) return;
    const id = window.setTimeout(() => setOpen(true), 3000);
    return () => window.clearTimeout(id);
  }, []);
  if (!open) return null;
  const close = () => {
    try {
      sessionStorage.setItem("pg-shop-news", "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>{t("newsletter.title")}</h2>
        <p>{t("newsletter.text")}</p>
        <input type="email" placeholder={t("newsletter.email")} className={styles.input} />
        <div className={styles.row}>
          <button className={styles.btn} onClick={close}>
            {t("newsletter.subscribe")}
          </button>
          <button className={styles.btnGhost} onClick={close}>
            {t("newsletter.dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Catalog({ search }: { search: string }) {
  const ctx = useCtx();
  const t = useCms();
  useTitle("Katalog – Mokradło Sklep");
  const q = new URLSearchParams(search);
  const page = Math.max(1, Number(q.get("strona") ?? "1") || 1);
  const [data, setData] = useState<CatalogData["catalog"] | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [from, setFrom] = useState(q.get("cena_od") ?? "");
  const [to, setTo] = useState(q.get("cena_do") ?? "");

  useEffect(() => {
    const p = new URLSearchParams(search);
    let alive = true;
    void gql<CatalogData>(ctx, "Catalog", {
      kategoria: p.get("kategoria") ?? "",
      cena_od: p.get("cena_od") ?? "",
      cena_do: p.get("cena_do") ?? "",
      sort: p.get("sort") ?? "nazwa",
      strona: Number(p.get("strona") ?? "1") || 1,
    }).then((r) => alive && setData(r.data?.catalog ?? null));
    setFrom(p.get("cena_od") ?? "");
    setTo(p.get("cena_do") ?? "");
    return () => {
      alive = false;
    };
  }, [ctx, search]);

  const go = (patch: Record<string, string>) => {
    const n = new URLSearchParams(search);
    for (const [k, v] of Object.entries(patch)) {
      if (v) n.set(k, v);
      else n.delete(k);
    }
    if (!("strona" in patch)) n.delete("strona");
    const s = n.toString();
    ctx.navigate(s ? `/sklep?${s}` : "/sklep");
  };

  const cats = data?.categories ?? [];
  return (
    <>
      <Hero />
      <div className={styles.toolbar}>
        <h2>{t("catalog.title")}</h2>
        {/* LO-15: icon only, no text, no title, no aria */}
        <button className={styles.iconBtn} onClick={() => setShowFilters(!showFilters)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 5h14M6 10h8M9 15h2" />
          </svg>
        </button>
      </div>
      {showFilters && (
        <div className={styles.filters}>
          <div>
            <div className={styles.fl}>{t("filters.category")}</div>
            <Dropdown
              value={q.get("kategoria") ?? ""}
              options={[
                { value: "", label: t("filters.categoryAll") },
                ...cats.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
              onChange={(v) => go({ kategoria: v })}
            />
          </div>
          <div>
            <div className={styles.fl}>{t("filters.priceFrom")}</div>
            <input className={styles.input} value={from} onChange={(e) => setFrom(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <div className={styles.fl}>{t("filters.priceTo")}</div>
            <input className={styles.input} value={to} onChange={(e) => setTo(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <div className={styles.fl}>{t("filters.sort")}</div>
            <Dropdown
              value={q.get("sort") ?? "nazwa"}
              options={["nazwa", "cena_rosnaco", "cena_malejaco"].map((s) => ({
                value: s,
                label: t(`sort.${s}`),
              }))}
              onChange={(v) => go({ sort: v })}
            />
          </div>
          <div className={styles.row}>
            <button className={styles.btn} onClick={() => go({ cena_od: from, cena_do: to })}>
              {t("filters.apply")}
            </button>
            <button className={styles.btnGhost} onClick={() => ctx.navigate("/sklep")}>
              {t("filters.clear")}
            </button>
          </div>
        </div>
      )}
      {data && data.products.length === 0 && <p className={styles.muted}>{t("catalog.empty")}</p>}
      <div className={styles.grid}>
        {(data?.products ?? []).map((p) => (
          <Link key={p.slug} to={`/sklep/produkt/${p.slug}`} className={`${styles.card} _x1 mk-c-9f2__card`}>
            <Art hue={p.hue} category={p.category} />
            <div className={styles.cardBody}>
              <div className={styles.cardName}>{p.name}</div>
              <div className={styles.price}>{money(p.price)}</div>
            </div>
          </Link>
        ))}
      </div>
      <div className={styles.pager}>
        {page > 1 && (
          <Link to={`/sklep?${new URLSearchParams({ ...Object.fromEntries(q), strona: String(page - 1) })}`}>
            {t("catalog.prev")}
          </Link>
        )}
        <span>
          {t("catalog.page")} {page}
        </span>
        {/* LO-26: always shown */}
        <Link to={`/sklep?${new URLSearchParams({ ...Object.fromEntries(q), strona: String(page + 1) })}`}>
          {t("catalog.next")}
        </Link>
      </div>
      <Newsletter />
    </>
  );
}
