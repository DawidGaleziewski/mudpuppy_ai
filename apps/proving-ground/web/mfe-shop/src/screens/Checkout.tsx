import { useCallback, useEffect, useState } from "react";
import { Captcha, gql, money, useCms, useCtx, useTitle, type Cart, type GqlError } from "../lib";
import styles from "../App.module.css";

interface Locker {
  id: string;
  name: string;
}

export function Checkout() {
  const ctx = useCtx();
  const t = useCms();
  useTitle("Zamówienie – Mokradło Sklep");
  const [cart, setCart] = useState<Cart | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [f, setF] = useState({
    name: "",
    email: "",
    postal_code: "",
    city: "",
    delivery: "kurier",
    locker: "",
    payment: "blik",
  });
  const [token, setToken] = useState("");
  const [errors, setErrors] = useState<GqlError[]>([]);
  const [busy, setBusy] = useState(false);
  const onToken = useCallback((x: string) => setToken(x), []);
  const set = (k: keyof typeof f, v: string) => setF((o) => ({ ...o, [k]: v }));

  useEffect(() => {
    void gql<{ cart: Cart }>(ctx, "Cart").then((r) => r.data && setCart(r.data.cart));
    void ctx
      .api("/api/shop/lockers")
      .then((r) => r.json())
      .then((j: { cities: string[] }) => setCities(j.cities));
  }, [ctx]);

  // LO-48: the parcel locker list depends on the chosen city.
  useEffect(() => {
    setLockers([]);
    if (!f.city) return;
    let alive = true;
    void ctx
      .api(`/api/shop/lockers?miasto=${encodeURIComponent(f.city)}`)
      .then((r) => r.json())
      .then((j: { lockers: Locker[] }) => alive && setLockers(j.lockers));
    return () => {
      alive = false;
    };
  }, [ctx, f.city]);

  const err = (field: string) => errors.find((e) => e.extensions?.field === field)?.message;
  const general = errors.filter((e) => !e.extensions?.field || e.extensions.field === "cart");

  const submit = async () => {
    setBusy(true);
    const r = await gql(ctx, "PlaceOrder", { ...f, captcha_token: token });
    setBusy(false);
    setErrors(r.errors);
    if (r.errors.length === 0) {
      const d = r.data as { placeOrder: { id: string; total: number } };
      try {
        sessionStorage.setItem("pg-shop-last-order", JSON.stringify(d.placeOrder));
      } catch {
        /* ignore */
      }
      ctx.emit("cart-changed", { count: 0 });
      ctx.navigate("/sklep/zamowienie/potwierdzenie");
    }
  };

  const field = (k: "name" | "email" | "postal_code", label: string, placeholder?: string) => (
    <div className={styles.field}>
      <label>{label}</label>
      <input
        className={styles.input}
        value={f[k]}
        placeholder={placeholder}
        onChange={(e) => set(k, e.target.value)}
      />
      {err(k) && <div className={styles.error}>{err(k)}</div>}
    </div>
  );

  return (
    <div>
      <h1>{t("checkout.title")}</h1>
      <div className={styles.checkout}>
        <div className={styles.form}>
          {field("name", t("checkout.name"))}
          {field("email", t("checkout.email"))}
          {field("postal_code", t("checkout.postal"), t("checkout.postalHint"))}
          <div className={styles.field}>
            <label>{t("checkout.city")}</label>
            <select
              className={styles.input}
              value={f.city}
              onChange={(e) => setF((o) => ({ ...o, city: e.target.value, locker: "" }))}
            >
              <option value="">{t("checkout.cityChoose")}</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {err("city") && <div className={styles.error}>{err("city")}</div>}
          </div>
          <fieldset className={styles.fieldset}>
            <legend>{t("checkout.delivery")}</legend>
            {(["kurier", "paczkomat"] as const).map((d) => (
              <label key={d} className={styles.radio}>
                <input type="radio" name="delivery" checked={f.delivery === d} onChange={() => set("delivery", d)} />
                {d === "kurier" ? t("checkout.courier") : t("checkout.locker")}
              </label>
            ))}
            {f.delivery === "paczkomat" && (
              <div className={styles.field}>
                <select className={styles.input} value={f.locker} onChange={(e) => set("locker", e.target.value)}>
                  <option value="">{t("checkout.lockerChoose")}</option>
                  {lockers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                {err("locker") && <div className={styles.error}>{err("locker")}</div>}
              </div>
            )}
            {err("delivery") && <div className={styles.error}>{err("delivery")}</div>}
          </fieldset>
          <fieldset className={styles.fieldset}>
            <legend>{t("checkout.payment")}</legend>
            {["blik", "card", "transfer"].map((p) => (
              <label key={p} className={styles.radio}>
                <input type="radio" name="payment" checked={f.payment === p} onChange={() => set("payment", p)} />
                {t(`checkout.pay.${p}`)}
              </label>
            ))}
          </fieldset>
          <Captcha onToken={onToken} />
          {err("captcha_token") && <div className={styles.error}>{err("captcha_token")}</div>}
          {general.map((e) => (
            <div key={e.message} className={styles.error}>
              {e.message}
            </div>
          ))}
          <button className={styles.btn} disabled={busy} onClick={() => void submit()}>
            {busy ? t("checkout.sending") : t("checkout.submit")}
          </button>
        </div>
        <aside className={styles.summary}>
          <h2>{t("checkout.summary.title")}</h2>
          {cart?.items.map((i) => (
            <div key={i.slug}>
              {i.qty} × {i.name} — {money(i.line_total)}
            </div>
          ))}
          {cart && (
            <>
              <div>
                {t("cart.delivery")}: {money(cart.delivery_cost)}
              </div>
              <div className={styles.priceBig}>
                {t("checkout.summary.total")}: {money(cart.grand_total)}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
