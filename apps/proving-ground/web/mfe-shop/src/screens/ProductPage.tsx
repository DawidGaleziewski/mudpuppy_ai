import { useEffect, useState } from "react";
import { Art, gql, Link, money, useCms, useCtx, useTitle, type Cart, type Product } from "../lib";
import styles from "../App.module.css";

export function ProductPage({ slug }: { slug: string }) {
  const ctx = useCtx();
  const t = useCms();
  const [p, setP] = useState<Product | null | undefined>(undefined);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState("");
  useTitle(p ? `${p.name} – Mokradło Sklep` : "Produkt – Mokradło Sklep");
  useEffect(() => {
    let alive = true;
    void gql<{ product: Product }>(ctx, "Product", { slug }).then((r) => alive && setP(r.data?.product ?? null));
    return () => {
      alive = false;
    };
  }, [ctx, slug]);
  if (p === undefined) return <p className={styles.muted}>{t("loading")}</p>;
  if (p === null) return <p>{t("product.notFound")}</p>;
  // LO-10: a div with onClick, not a button.
  const add = async () => {
    const r = await gql<{ cart: Cart }>(ctx, "AddToCart", { slug, qty });
    if (r.errors.length > 0 || !r.data) {
      setMsg(r.errors[0]?.message ?? "");
      return;
    }
    setMsg(t("product.added"));
    ctx.emit("cart-changed", { count: r.data.cart.count });
  };
  return (
    <div>
      <Link to="/sklep" className={styles.back}>
        ← {t("product.back")}
      </Link>
      <div className={styles.product}>
        <div className={styles.productArt}>
          <Art hue={p.hue} category={p.category} big />
        </div>
        <div>
          <h1>{p.name}</h1>
          <div className={styles.priceBig}>{money(p.price)}</div>
          <p>{p.description}</p>
          <div className={styles.row}>
            <span>{t("product.qty")}</span>
            <input
              className={`${styles.input} ${styles.qty}`}
              type="number"
              min={1}
              max={10}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </div>
          <div className={`${styles.btn} ${styles.divBtn}`} onClick={() => void add()}>
            {t("product.add")}
          </div>
          {msg && <p className={styles.note}>{msg}</p>}
        </div>
      </div>
    </div>
  );
}
