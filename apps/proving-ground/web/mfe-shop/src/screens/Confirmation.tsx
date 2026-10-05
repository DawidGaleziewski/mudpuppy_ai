import { Link, money, useCms, useTitle } from "../lib";
import styles from "../App.module.css";

export function Confirmation() {
  const t = useCms();
  useTitle("Potwierdzenie zamówienia – Mokradło Sklep");
  type Last = { id: string; total: number } | null;
  let order = null as Last;
  try {
    order = JSON.parse(sessionStorage.getItem("pg-shop-last-order") ?? "null") as Last;
  } catch {
    order = null;
  }
  return (
    <div className={styles.confirm}>
      <h1>{t("confirm.title")}</h1>
      {order && (
        <p>
          {t("confirm.number")}: <b>{order.id}</b> ({money(order.total)})
        </p>
      )}
      <p>{t("confirm.text")}</p>
      <Link to="/sklep" className={styles.btn}>
        {t("confirm.continue")}
      </Link>
    </div>
  );
}
