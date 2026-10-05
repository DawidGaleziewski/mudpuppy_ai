import { useEffect, useState } from "react";
import type { MountContext } from "./context";
import { Account } from "./screens/Account";
import { CartPage } from "./screens/CartPage";
import { Catalog } from "./screens/Catalog";
import { Checkout } from "./screens/Checkout";
import { Confirmation } from "./screens/Confirmation";
import { ProductPage } from "./screens/ProductPage";
import { Ctx, Link, useCms } from "./lib";
import styles from "./App.module.css";

function Shell({ path }: { path: string }) {
  const t = useCms();
  const clean = path.split("?")[0]?.replace(/\/+$/, "") ?? "";
  let screen;
  if (clean === "/sklep/koszyk") screen = <CartPage />;
  else if (clean === "/sklep/zamowienie") screen = <Checkout />;
  else if (clean === "/sklep/zamowienie/potwierdzenie") screen = <Confirmation />;
  else if (clean === "/sklep/konto") screen = <Account />;
  else if (clean.startsWith("/sklep/produkt/"))
    screen = <ProductPage slug={decodeURIComponent(clean.slice("/sklep/produkt/".length))} />;
  else screen = <Catalog search={path.includes("?") ? path.slice(path.indexOf("?")) : ""} />;
  return (
    <div className={`${styles.root} _s1 mk-sh-3a1__root`}>
      <header className={styles.bar}>
        <Link to="/sklep" className={styles.brand}>
          {t("brand.name")}
        </Link>
        <nav className={styles.nav}>
          <Link to="/sklep">{t("nav.catalog")}</Link>
          <Link to="/sklep/koszyk">{t("nav.cart")}</Link>
          <Link to="/sklep/konto">{t("nav.account")}</Link>
        </nav>
      </header>
      <main className={styles.main}>{screen}</main>
    </div>
  );
}

export function App({ ctx }: { ctx: MountContext }) {
  const [path, setPath] = useState(ctx.path());
  useEffect(() => ctx.on("route", () => setPath(ctx.path())), [ctx]);
  return (
    <Ctx.Provider value={ctx}>
      <Shell path={path} />
    </Ctx.Provider>
  );
}
