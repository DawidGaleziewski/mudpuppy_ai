import { useEffect, useState } from "react";
import { money, useCms, useCtx, useTitle } from "../lib";
import styles from "../App.module.css";

interface Order {
  id: string;
  date: string;
  grand_total: number;
}

export function Account() {
  const ctx = useCtx();
  const t = useCms();
  useTitle("Moje konto – Mokradło Sklep");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    let alive = true;
    void ctx.api("/api/shop/orders").then(async (r) => {
      if (!alive) return;
      if (r.status === 401) setDenied(true);
      else setOrders(((await r.json()) as { orders: Order[] }).orders);
    });
    return () => {
      alive = false;
    };
  }, [ctx]);
  if (denied)
    return (
      <p>
        <a href="/logowanie?marka=shop&next=/sklep/konto">{t("account.login")}</a>
      </p>
    );
  return (
    <div>
      <h1>{t("account.title")}</h1>
      {orders && orders.length === 0 && <p>{t("account.empty")}</p>}
      {orders && orders.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("account.order")}</th>
              <th>{t("account.date")}</th>
              <th>{t("account.value")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.date}</td>
                <td>{money(o.grand_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
