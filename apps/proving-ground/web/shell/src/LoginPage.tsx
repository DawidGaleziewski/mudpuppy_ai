import { useEffect, useState } from "react";
import { useCms } from "./cms";
import s from "./Shell.module.css";

type Brand = "shop" | "bank" | "insurer";

interface FormInfo {
  csrf: string;
  captcha_required: boolean;
}

/**
 * One login component for all three brands; only the CMS texts differ (white-label, LO-09). It
 * is a classic form POST (LO-30). Bank and insurer show placeholders only, no labels (LO-11);
 * the shop form has labels. After a failure the CAPTCHA widget is required (LO-37).
 */
export function LoginPage(props: { widgetOrigin: string }) {
  const t = useCms("shell");
  const q = new URLSearchParams(location.search);
  const brand = (["shop", "bank", "insurer"].includes(q.get("marka") ?? "")
    ? q.get("marka")
    : "bank") as Brand;
  const next = q.get("next") ?? "";
  const error = q.get("blad");
  const [info, setInfo] = useState<FormInfo | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    document.title = `${t(`login.${brand}.title`)} – ${t(`brand.${brand}`)}`;
  });

  useEffect(() => {
    fetch(`/api/login/form?marka=${brand}`, { credentials: "include" })
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [brand]);

  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.origin === props.widgetOrigin && e.data?.type === "pg-captcha") setToken(e.data.token);
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [props.widgetOrigin]);

  const labelled = brand === "shop";
  return (
    <main className={`${s.login} mk-l0g1n__wrap _pp4 ${s[`brand_${brand}`] ?? ""}`}>
      <h1 className={s.h1}>{t(`login.${brand}.title`)}</h1>
      <p className={s.muted}>{t(`login.${brand}.intro`)}</p>
      {error && <p className={`${s.error} err-0x2 _e`}>{t(`login.error.${error}`)}</p>}
      <form method="post" action="/api/login" className={`${s.form} f0rm-q _x1`}>
        <input type="hidden" name="csrf" value={info?.csrf ?? ""} />
        <input type="hidden" name="marka" value={brand} />
        <input type="hidden" name="next" value={next} />
        {labelled ? (
          <>
            <label className={s.field}>
              <span>{t("login.field.login")}</span>
              <input name="login" autoComplete="username" />
            </label>
            <label className={s.field}>
              <span>{t("login.field.password")}</span>
              <input name="haslo" type="password" autoComplete="current-password" />
            </label>
          </>
        ) : (
          <>
            <input
              className={`${s.input} inp-7a _w100`}
              name="login"
              placeholder={t("login.field.login")}
              autoComplete="username"
            />
            <input
              className={`${s.input} inp-7a _w100`}
              name="haslo"
              type="password"
              placeholder={t("login.field.password")}
              autoComplete="current-password"
            />
          </>
        )}
        {info?.captcha_required && (
          <div className="g-recaptcha" data-sitekey="pg-test-key">
            <iframe
              title="reCAPTCHA"
              src={`${props.widgetOrigin}/widget/recaptcha/api2/anchor?k=pg-test-key`}
              width="304"
              height="78"
            />
            <input type="hidden" name="g-recaptcha-response" value={token} />
          </div>
        )}
        <button type="submit" className={`${s.primary} btn--pr1m _b`}>
          {t("login.submit")}
        </button>
      </form>
    </main>
  );
}
