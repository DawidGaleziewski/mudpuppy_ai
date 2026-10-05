import { useEffect, useRef, useState } from "react";
import s from "./App.module.css";
import { LoginNotice } from "./Screens";
import {
  getJson,
  post,
  Unauthorized,
  useCms,
  useMount,
  useTitle,
  type Policy,
  type WizardState,
} from "./support";

const BASE = "/api/insurer/claims/wizard";

/**
 * Claim wizard. The state lives on the server (LO-33): the browser Back button moves the hash to
 * an earlier step, and the page answers by resetting the server state and showing step 1.
 * `urlStep` is the step named in the hash.
 */
export function Wizard({ urlStep }: { urlStep: number }) {
  const ctx = useMount();
  const t = useCms();
  useTitle(t("title.claim"));
  const [step, setStep] = useState(1);
  const stepRef = useRef(1);
  const [ready, setReady] = useState(false);
  const [login, setLogin] = useState(false);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policyNr, setPolicyNr] = useState("");
  const [date, setDate] = useState("");
  const [opis, setOpis] = useState("");
  const [miejsce, setMiejsce] = useState("");
  const [fileId, setFileId] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  const go = (n: number) => {
    stepRef.current = n;
    setStep(n);
    window.location.hash = `#/szkody/nowa/${n}`;
  };

  useEffect(() => {
    let alive = true;
    Promise.all([
      getJson<WizardState>(ctx, BASE),
      getJson<{ policies: Policy[] }>(ctx, "/api/insurer/policies"),
    ])
      .then(([w, p]) => {
        if (!alive) return;
        const d = w.data as Record<string, string | undefined>;
        setPolicies(p.policies);
        setPolicyNr(d.policy_nr ?? p.policies[0]?.nr ?? "");
        setDate(d.data_zdarzenia ?? "");
        setOpis(d.opis ?? "");
        setMiejsce(d.miejsce ?? "");
        stepRef.current = w.step;
        setStep(w.step);
        setReady(true);
      })
      .catch((e: unknown) => e instanceof Unauthorized && setLogin(true));
    return () => {
      alive = false;
    };
  }, [ctx]);

  // Back button: the hash names an earlier step than the one we are on.
  useEffect(() => {
    if (!ready || urlStep >= stepRef.current) return;
    void post(ctx, `${BASE}/reset`).then(() => {
      stepRef.current = 1;
      setStep(1);
      setPolicyNr(policies[0]?.nr ?? "");
      setDate("");
      setOpis("");
      setMiejsce("");
      setFileId("");
      setFileName("");
      setError("");
      window.location.replace("#/szkody/nowa/1");
    });
  }, [urlStep, ready, ctx, policies]);

  // The upload widget tells us the id of the file it stored (LO-03).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== ctx.widgetOrigin) return;
      const m = e.data as { type?: string; file_id?: string };
      if (m?.type === "pg-upload" && m.file_id) setFileId(m.file_id);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [ctx]);

  const submit = async (n: number, body: unknown) => {
    setError("");
    const r = await post(ctx, `${BASE}/step${n}`, body);
    if (r.status === 401) return setLogin(true);
    const res = (await r.json()) as { message?: string; step?: number; claim_nr?: string };
    if (r.status === 409 && res.step) {
      stepRef.current = res.step;
      setStep(res.step);
      return;
    }
    if (!r.ok) return setError(res.message ?? t("err.generic"));
    if (n === 3 && res.claim_nr) {
      window.location.hash = `#/szkody/potwierdzenie?nr=${encodeURIComponent(res.claim_nr)}`;
      return;
    }
    go(n + 1);
  };

  if (login) return <LoginNotice />;
  const uploadSrc = `${ctx.widgetOrigin}/widget/upload`;
  return (
    <div>
      <h1>{t("claim.heading")}</h1>
      <div className={s.warning}>{t("claim.warning")}</div>
      <p className={s.muted}>
        {t("claim.step")} {step}/3
      </p>
      {ready && step === 1 && (
        <div>
          <h2>{t("claim.step1")}</h2>
          <div className={s.field}>
            <label>
              {t("claim.policy")}
              <select value={policyNr} onChange={(e) => setPolicyNr(e.target.value)}>
                {policies.map((p) => (
                  <option key={p.nr} value={p.nr}>
                    {p.nazwa}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={s.field}>
            <label>
              {t("claim.date")}
              {/* LO-47: no min or max here; the server judges the date. */}
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <div className={s.field}>
            <label>
              {t("claim.desc")}
              <textarea value={opis} onChange={(e) => setOpis(e.target.value)} />
            </label>
          </div>
          <button
            className={s.btn}
            onClick={() =>
              void submit(1, { policy_nr: policyNr, data_zdarzenia: date, opis })
            }
          >
            {t("claim.next")}
          </button>
        </div>
      )}
      {ready && step === 2 && (
        <div>
          <h2>{t("claim.step2")}</h2>
          <div className={s.field}>
            <label>
              {t("claim.place")}
              <input value={miejsce} onChange={(e) => setMiejsce(e.target.value)} />
            </label>
          </div>
          <p>{t("claim.upload")}</p>
          <iframe className={s.iframe} title={t("claim.upload")} src={uploadSrc} />
          {fileId && <p className={s.ok}>{t("claim.uploaded")}</p>}
          <button
            className={s.btn}
            onClick={() =>
              void submit(2, { miejsce, ...(fileId ? { uploaded_file_id: fileId } : {}) })
            }
          >
            {t("claim.next")}
          </button>
        </div>
      )}
      {ready && step === 3 && (
        <div>
          <h2>{t("claim.step3")}</h2>
          <div className={s.card}>
            <p>
              {t("claim.policy")}: {policies.find((p) => p.nr === policyNr)?.nazwa}
            </p>
            <p>
              {t("claim.date")}: {date}
            </p>
            <p>
              {t("claim.desc")}: {opis}
            </p>
            <p>
              {t("claim.place")}: {miejsce}
            </p>
            {fileName && (
              <p>
                {t("claim.file")}: {fileName}
              </p>
            )}
          </div>
          <button className={s.btn} onClick={() => void submit(3, {})}>
            {t("claim.submit")}
          </button>
        </div>
      )}
      {error && <p className={s.error}>{error}</p>}
    </div>
  );
}
