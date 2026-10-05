import { useEffect, useState } from "react";
import { gql, Link, money, useCms, useCtx, useTitle, type Cart } from "../lib";
import styles from "../App.module.css";

export function CartPage() {
  const ctx = useCtx();
  const t = useCms();
  const [cart, setCart] = useState<Cart | null>(null);
  const [err, setErr] = useState("");
  useTitle("Koszyk – Mokradło Sklep");
  const apply = (r: Awaited<ReturnType<typeof gql<{ cart: Cart }>>>) => {
    if (r.data) {
      setCart(r.data.cart);
      ctx.emit("cart-changed", { count: r.data.cart.count });
    }
    setErr(r.errors[0]?.message ?? "");
  };
  useEffect(() => {
    let alive = true;
    void gql<{ cart: Cart }>(ctx, "Cart").then((r) => alive && r.data && setCart(r.data.cart));
    return () => {
      alive = false;
    };
  }, [ctx]);
  if (!cart) return <p className={styles.muted}>{t("loading")}</p>;
  if (cart.items.length === 0)
    return (
      <div>
        <h1>{t("cart.title")}</h1>
        <p>{t("cart.empty")}</p>
        <Link to="/sklep" className={styles.btn}>
          {t("nav.catalog")}
        </Link>
      </div>
    );
  return (
    <div>
      <h1>{t("cart.title")}</h1>
      {err && <p className={styles.error}>{err}</p>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t("cart.product")}</th>
            <th>{t("cart.price")}</th>
            <th>{t("cart.qty")}</th>
            <th>{t("cart.sum")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cart.items.map((i) => (
            <tr key={i.slug}>
              <td>
                <Link to={`/sklep/produkt/${i.slug}`}>{i.name}</Link>
              </td>
              <td>{money(i.price)}</td>
              <td>
                <input
                  className={`${styles.input} ${styles.qty}`}
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={i.qty}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 1) void gql<{ cart: Cart }>(ctx, "UpdateCart", { slug: i.slug, qty: n }).then(apply);
                  }}
                />
              </td>
              <td>{money(i.line_total)}</td>
              <td>
                <button
                  className={styles.btnGhost}
                  onClick={() => void gql<{ cart: Cart }>(ctx, "UpdateCart", { slug: i.slug, qty: 0 }).then(apply)}
                >
                  {t("cart.remove")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.summary}>
        <div>
          {t("cart.products")}: <b>{money(cart.total)}</b>
        </div>
        <div>
          {t("cart.delivery")}: <b>{money(cart.delivery_cost)}</b>
        </div>
        {/* LO-51: only once the total reaches 200 zł */}
        {cart.free_delivery && <div className={styles.free}>{t("cart.freeDelivery")}</div>}
        <div className={styles.muted}>{t("checkout.summary.vatNote")}</div>
        <div className={styles.priceBig}>
          {t("cart.total")}: {money(cart.grand_total)}
        </div>
        <Link to="/sklep/zamowienie" className={styles.btn}>
          {t("cart.checkout")}
        </Link>
      </div>
    </div>
  );
}
