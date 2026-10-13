import { useEffect, useState, type ReactNode } from "react";
import s from "./App.module.css";
import { DatePicker } from "./DatePicker";
import {
  getJson,
  loginHref,
  post,
  sum,
  Unauthorized,
  useCms,
  useMount,
  useTitle,
  zl,
  type Addon,
  type Policy,
} from "./support";

function useLoad<T>(path: string) {
  const ctx = useMount();
  const [data, setData] = useState<T | null>(null);
  const [failure, setFailure] = useState<"login" | "other" | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    setFailure(null);
    getJson<T>(ctx, path)
      .then((d) => alive && setData(d))
      .catch((e: unknown) => alive && setFailure(e instanceof Unauthorized ? "login" : "other"));
    return () => {
      alive = false;
    };
  }, [ctx, path]);
  return { data, failure };
}

export function LoginNotice() {
  const t = useCms();
  return (
    <div className={`${s.card} _x1 mk-ins-7a1__notice`}>
      <p>{t("err.login")}</p>
      <a className={s.link} href={loginHref()}>
        {t("err.loginLink")}
      </a>
    </div>
  );
}

function Guarded({ failure, children }: { failure: "login" | "other" | null; children: ReactNode }) {
  const t = useCms();
  if (failure === "login") return <LoginNotice />;
  if (failure === "other") return <p className={s.error}>{t("err.generic")}</p>;
  return <>{children}</>;
}

export function Guest() {
  const t = useCms();
  const [calculating, setCalculating] = useState(false);
  useTitle(t("title.guest"));

  // LO-27: the terms open in a window we write ourselves; there is no URL to crawl.
  const openOwu = () => {
    const w = window.open("about:blank", "_blank");
    if (!w) return;
    w.document.write(
      `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${t("owu.title")}</title></head>` +
        `<body><h1>${t("owu.title")}</h1><p>${t("owu.body")}</p></body></html>`,
    );
    w.document.close();
  };

  return (
    <div>
      <h1>{t("guest.heading")}</h1>
      <p>{t("guest.intro")}</p>
      <p>
        <a className={s.link} href="#" onClick={(e) => (e.preventDefault(), openOwu())}>
          {t("guest.owu")}
        </a>
      </p>
      <div className={s.row}>
        <button className={`${s.btn} _x1 mk-btn--primary__z9`} onClick={() => setCalculating(true)}>
          {t("guest.compare")}
        </button>
        <a
          className={s.link}
          href={`/logowanie?marka=insurer&next=${encodeURIComponent("/ubezpieczenia#/polisy")}`}
        >
          {t("guest.login")}
        </a>
      </div>
      {calculating && (
        // LO-45: a spinner that never resolves; nothing is ever fetched.
        <p>
          <span className={s.spinner} />
          {t("guest.calculating")}
        </p>
      )}
    </div>
  );
}

export function Policies() {
  const t = useCms();
  useTitle(t("title.polisy"));
  const { data, failure } = useLoad<{ policies: Policy[] }>("/api/insurer/policies");
  return (
    <div>
      <h1>{t("list.heading")}</h1>
      <Guarded failure={failure}>
        {data && data.policies.length === 0 && <p>{t("list.empty")}</p>}
        {data?.policies.map((p) => (
          <div key={p.nr} className={`${s.card} _x1 mk-ins-7a1__policy`}>
            <h2>
              <a className={s.link} href={`#/polisy/${p.nr}`}>
                {p.nazwa}
              </a>
            </h2>
            <div className={s.row}>
              <span>
                {t("list.sum")}: {sum(p.suma)}
              </span>
              <span>
                {t("list.premium")}: {zl(p.skladka)}
              </span>
              <span>
                {t("list.period")}: {p.od} – {p.do}
              </span>
            </div>
          </div>
        ))}
      </Guarded>
    </div>
  );
}

export function Detail({ nr }: { nr: string }) {
  const t = useCms();
  useTitle(t("title.detail"));
  const { data, failure } = useLoad<Policy>(`/api/insurer/policies/${nr}`);
  return (
    <div>
      <h1>{t("detail.heading")}</h1>
      <Guarded failure={failure}>
        {data && (
          <div className={`${s.card} _x1 mk-ins-7a1__detail`}>
            <h2>{data.nazwa}</h2>
            <p>
              {t("detail.number")}: {data.nr}
            </p>
            <p>
              {t("detail.type")}: {data.typ}
            </p>
            <p>
              {t("detail.sum")}: {sum(data.suma)}
            </p>
            <p>
              {t("detail.premium")}: {zl(data.skladka)}
            </p>
            <p>
              {t("detail.period")}: {data.od} – {data.do}
            </p>
            <div className={s.row}>
              <a className={s.link} href={`/api/insurer/policies/${nr}.pdf`} download>
                {t("detail.pdf")}
              </a>
              <a className={s.link} href={`#/polisy/${nr}/dodatki`}>
                {t("detail.addons")}
              </a>
              <a className={s.link} href="#/szkody/nowa">
                {t("detail.claim")}
              </a>
              {/* The legacy part is still linked from the new app (S08, spec 015 F-19). */}
              <a className={s.link} href="/legacy/insurer/szkoda-stara.do">
                {t("detail.claimOld")}
              </a>
            </div>
          </div>
        )}
        <p>
          <a className={s.link} href="#/polisy">
            {t("detail.back")}
          </a>
        </p>
      </Guarded>
    </div>
  );
}

export function Addons({ nr }: { nr: string }) {
  const ctx = useMount();
  const t = useCms();
  useTitle(t("title.addons"));
  const { data, failure } = useLoad<{ addons: Addon[] }>(`/api/insurer/policies/${nr}/addons`);
  const [start, setStart] = useState("");
  const [today, setToday] = useState("2026-03-01");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void ctx
      .api("/api/clock")
      .then((r) => r.json() as Promise<{ today: string }>)
      .then((c) => setToday(c.today))
      .catch(() => undefined);
  }, [ctx]);

  const add = async (id: string) => {
    const r = await post(ctx, `/api/insurer/policies/${nr}/addons`, {
      addon_id: id,
      data_rozpoczecia: start,
    });
    const body = (await r.json()) as { message?: string };
    setMsg(r.ok ? { ok: true, text: t("addons.added") } : { ok: false, text: body.message ?? "" });
  };

  return (
    <div>
      <h1>{t("addons.heading")}</h1>
      <Guarded failure={failure}>
        <div className={s.field}>
          <span>{t("addons.start")}</span>
          <DatePicker value={start} onChange={setStart} start={today} />
        </div>
        {data?.addons.map((a) => (
          <div key={a.id} className={`${s.card} _x1 mk-ins-7a1__addon`}>
            <div className={s.row}>
              <strong>{a.nazwa}</strong>
              <span>
                {t("addons.price")}: {zl(a.cena)}
              </span>
              {a.dostepny ? (
                <button className={s.btn} onClick={() => void add(a.id)}>
                  {t("addons.add")}
                </button>
              ) : (
                <span className={s.muted}>
                  {t("addons.unavailable")}: {a.powod}
                </span>
              )}
            </div>
          </div>
        ))}
        {msg && <p className={msg.ok ? s.ok : s.error}>{msg.text}</p>}
        <p>
          <a className={s.link} href={`#/polisy/${nr}`}>
            {t("addons.back")}
          </a>
        </p>
      </Guarded>
    </div>
  );
}

export function Done({ nr }: { nr: string }) {
  const t = useCms();
  useTitle(t("title.done"));
  return (
    <div>
      <h1>{t("done.heading")}</h1>
      <p>
        {t("done.number")}: <strong>{nr}</strong>
      </p>
      <a className={s.link} href="#/polisy">
        {t("done.home")}
      </a>
    </div>
  );
}
