import { useEffect, useState } from "react";
import { currentPath, navigate, on } from "./bus";
import { useCms } from "./cms";
import { LoginPage } from "./LoginPage";
import { MfeHost } from "./MfeHost";
import s from "./Shell.module.css";

type Brand = "shop" | "bank" | "insurer";

const route = (path: string): { kind: "home" | "login" | Brand } => {
  const p = path.split(/[?#]/, 1)[0] ?? "/";
  if (p.startsWith("/sklep")) return { kind: "shop" };
  if (p.startsWith("/bank")) return { kind: "bank" };
  if (p.startsWith("/ubezpieczenia")) return { kind: "insurer" };
  if (p === "/logowanie") return { kind: "login" };
  return { kind: "home" };
};

const BASE: Record<Brand, string> = { shop: "/sklep", bank: "/bank", insurer: "/ubezpieczenia" };

function Link(props: { to: string; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={props.to}
      className={props.className}
      onClick={(e) => {
        e.preventDefault();
        navigate(props.to);
      }}
    >
      {props.children}
    </a>
  );
}

function Home() {
  const t = useCms("shell");
  useEffect(() => {
    document.title = t("home.title");
  });
  return (
    <main className={`${s.home} hm-9x _grid`}>
      <h1 className={s.h1}>{t("home.heading")}</h1>
      <p className={s.muted}>{t("home.intro")}</p>
      <div className={`${s.tiles} t1les _3c`}>
        {(["shop", "bank", "insurer"] as Brand[]).map((b) => (
          <Link key={b} to={BASE[b]} className={`${s.tile} t1le-${b} _hov`}>
            <strong>{t(`brand.${b}`)}</strong>
            <span>{t(`home.tile.${b}`)}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}

function ExpiredModal() {
  const t = useCms("shell");
  const [open, setOpen] = useState(false);
  useEffect(() => on("session-expired", () => setOpen(true)), []);
  if (!open) return null;
  const brand = route(currentPath()).kind;
  const marka = brand === "shop" || brand === "bank" || brand === "insurer" ? brand : "bank";
  const href = `/logowanie?marka=${marka}&next=${encodeURIComponent(currentPath())}`;
  return (
    <div className={`${s.scrim} mdl-bg _z9`}>
      <div className={`${s.modal} mdl-0 _c`}>
        <p>{t("session.expired")}</p>
        <a className={`${s.primary} btn--pr1m _b`} href={href}>
          {t("session.relogin")}
        </a>
      </div>
    </div>
  );
}

export function Shell(props: { widgetOrigin: string }) {
  const t = useCms("shell");
  const [path, setPath] = useState(currentPath());
  useEffect(() => on("route", () => setPath(currentPath())), []);
  const r = route(path);

  return (
    <div className={`${s.app} app-sh3ll _min-h`}>
      <header className={`${s.header} hdr-1 _flex _jb`}>
        <Link to="/" className={`${s.logo} lg0 _f`}>
          {t("group.name")}
        </Link>
        <nav className={`${s.nav} nv-2 _flex`}>
          {(["shop", "bank", "insurer"] as Brand[]).map((b) => (
            <Link key={b} to={BASE[b]} className={`${s.navLink} ${r.kind === b ? s.active : ""}`}>
              {t(`nav.${b}`)}
            </Link>
          ))}
        </nav>
        <mk-mini-cart />
      </header>
      {r.kind === "home" && <Home />}
      {r.kind === "login" && <LoginPage widgetOrigin={props.widgetOrigin} />}
      {(r.kind === "shop" || r.kind === "bank" || r.kind === "insurer") && (
        <MfeHost name={r.kind} basePath={BASE[r.kind]} widgetOrigin={props.widgetOrigin} />
      )}
      <footer className={`${s.footer} ftr _sm`}>{t("footer.text")}</footer>
      <MfeHost name="cookies" basePath="/" widgetOrigin={props.widgetOrigin} />
      <ExpiredModal />
    </div>
  );
}
