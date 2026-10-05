import { useEffect, useState, type FormEvent } from "react";
import styles from "./App.module.css";
import { useCms } from "./cms";
import type { MountContext } from "./context";

interface Account {
  id: string;
  name: string;
  iban: string;
  balance_text: string;
}
interface Transfer {
  to_iban: string;
  amount_text: string;
  title: string;
  booking_date: string;
}
interface Operation {
  date: string;
  title: string;
  amount_text: string;
}
interface SessionInfo {
  login?: string;
  legacy_sid?: string;
}

type T = (key: string) => string;

function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

function useRoute(ctx: MountContext): string {
  const [path, setPath] = useState(ctx.path());
  useEffect(() => ctx.on("route", () => setPath(ctx.path())), [ctx]);
  return path;
}

function Strip({ ctx, t }: { ctx: MountContext; t: T }) {
  const [login, setLogin] = useState("");
  useEffect(() => {
    ctx
      .api("/api/session")
      .then((r) => (r.ok ? (r.json() as Promise<SessionInfo>) : null))
      .then((s) => setLogin(s?.login ?? ""))
      .catch(() => undefined);
  }, [ctx]);
  const go = (to: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    ctx.navigate(to);
  };
  return (
    <header className={`${styles.strip} _x1 mk-c-9f2__strip`}>
      <strong>{t("bank.brand")}</strong>
      <a href="/bank/pulpit" onClick={go("/bank/pulpit")}>{t("bank.nav.dashboard")}</a>
      <a href="/bank/przelew" onClick={go("/bank/przelew")}>{t("bank.nav.transfer")}</a>
      <a href="/bank/wyciagi" onClick={go("/bank/wyciagi")}>{t("bank.nav.statements")}</a>
      <a href="/bank/historia" onClick={go("/bank/historia")}>{t("bank.nav.history")}</a>
      <span className={styles.spacer} />
      <span>{login}</span>
      <form className={styles.logout} method="post" action="/api/logout">
        <button className={styles.linkButton} type="submit">{t("bank.logout")}</button>
      </form>
    </header>
  );
}

function Home({ ctx, t }: { ctx: MountContext; t: T }) {
  useTitle(t("bank.title.home"));
  const chatDoc = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${t("bank.chat.title")}</title></head><body style="font-family:sans-serif"><h4>${t("bank.chat.title")}</h4><p>${t("bank.chat.hello")}</p></body></html>`;
  return (
    <main className={`${styles.main} _x1 mk-c-9f2__home`}>
      <h1>{t("bank.home.heading")}</h1>
      <p>{t("bank.home.lead")}</p>
      <img className={styles.banner} src="/api/bank/rates.png" alt="" width="420" height="130" />
      <a
        className={`${styles.cta} _x2`}
        href="/logowanie?marka=bank&next=/bank/pulpit"
        onClick={(e) => {
          e.preventDefault();
          ctx.navigate("/logowanie?marka=bank&next=/bank/pulpit");
        }}
      >
        {t("bank.home.login")}
      </a>
      <iframe className={styles.chat} title={t("bank.chat.title")} srcDoc={chatDoc} />
    </main>
  );
}

function Dashboard({ ctx, t }: { ctx: MountContext; t: T }) {
  useTitle(t("bank.title.dashboard"));
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [rate, setRate] = useState("");
  useEffect(() => {
    ctx
      .api("/api/bank/accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAccounts(d?.accounts ?? []))
      .catch(() => setAccounts([]));
    const source = new EventSource("/api/bank/ticker");
    source.addEventListener("rate", (e) => {
      setRate((JSON.parse((e as MessageEvent<string>).data) as { rate: string }).rate);
    });
    return () => source.close();
  }, [ctx]);
  return (
    <main className={`${styles.main} _x1 mk-c-9f2__dash`}>
      <h1>{t("bank.dashboard.heading")}</h1>
      {accounts === null && <p>{t("bank.dashboard.loading")}</p>}
      {accounts?.map((a) => (
        <section key={a.id} className={`${styles.card} _x3`}>
          <h2>{a.name}</h2>
          <div className={styles.iban}>{a.iban}</div>
          <div>
            {t("bank.dashboard.balance")}: <span className={styles.balance}>{a.balance_text}</span>
          </div>
        </section>
      ))}
      <p className={styles.ticker}>
        {t("bank.dashboard.ticker")}: <span>{rate}</span>
      </p>
    </main>
  );
}

function TransferForm({ ctx, t }: { ctx: MountContext; t: T }) {
  useTitle(t("bank.title.transfer"));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [from, setFrom] = useState("");
  const [iban, setIban] = useState("");
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    ctx
      .api("/api/bank/accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: Account[] = d?.accounts ?? [];
        setAccounts(list);
        setFrom(list[0]?.id ?? "");
      })
      .catch(() => undefined);
  }, [ctx]);
  const submit = async () => {
    setError("");
    const r = await ctx.api("/api/bank/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_account: from, to_iban: iban, amount, title }),
    });
    if (r.ok) {
      ctx.navigate("/bank/przelew/potwierdzenie");
      return;
    }
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (r.status !== 401) setError(body.error ?? "Błąd");
  };
  return (
    <main className={`${styles.main} _x1 mk-c-9f2__transfer`}>
      <h1>{t("bank.transfer.heading")}</h1>
      <form className={styles.form} onSubmit={(e: FormEvent) => e.preventDefault()}>
        <select className={styles.input} value={from} onChange={(e) => setFrom(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.balance_text})
            </option>
          ))}
        </select>
        <input
          className={styles.input}
          placeholder={t("bank.transfer.iban")}
          value={iban}
          onChange={(e) => setIban(e.target.value)}
        />
        <input
          className={styles.input}
          placeholder={t("bank.transfer.amount")}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className={styles.input}
          placeholder={t("bank.transfer.title")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className={`${styles.submit} _x4`} onClick={() => void submit()}>
          {t("bank.transfer.submit")}
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </form>
    </main>
  );
}

function Confirmation({ ctx, t }: { ctx: MountContext; t: T }) {
  useTitle(t("bank.title.confirmation"));
  const [transfer, setTransfer] = useState<Transfer | null | undefined>(undefined);
  useEffect(() => {
    ctx
      .api("/api/bank/transfers")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTransfer((d?.transfers as Transfer[] | undefined)?.at(-1) ?? null))
      .catch(() => setTransfer(null));
  }, [ctx]);
  return (
    <main className={`${styles.main} _x1 mk-c-9f2__confirm`}>
      {transfer ? (
        <>
          <h1>{t("bank.confirmation.heading")}</h1>
          <dl>
            <dt>{t("bank.confirmation.to")}</dt>
            <dd className={styles.iban}>{transfer.to_iban}</dd>
            <dt>{t("bank.confirmation.amount")}</dt>
            <dd>{transfer.amount_text}</dd>
            <dt>{t("bank.confirmation.title")}</dt>
            <dd>{transfer.title}</dd>
            <dt>{t("bank.confirmation.booking")}</dt>
            <dd>{transfer.booking_date}</dd>
          </dl>
        </>
      ) : (
        transfer === null && <p>{t("bank.confirmation.none")}</p>
      )}
      <a
        href="/bank/pulpit"
        onClick={(e) => {
          e.preventDefault();
          ctx.navigate("/bank/pulpit");
        }}
      >
        {t("bank.confirmation.back")}
      </a>
    </main>
  );
}

function shiftMonth(month: string, delta: number): string {
  const [y = 2026, m = 3] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.max(1, Math.floor(index / 12));
  return `${String(year).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function Statements({ ctx, t, query }: { ctx: MountContext; t: T; query: URLSearchParams }) {
  useTitle(t("bank.title.statements"));
  const raw = query.get("miesiac") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : "2026-03";
  const [ops, setOps] = useState<Operation[] | null>(null);
  useEffect(() => {
    setOps(null);
    ctx
      .api(`/api/bank/statements?miesiac=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setOps(d?.operations ?? []))
      .catch(() => setOps([]));
  }, [ctx, month]);
  const link = (target: string, text: string) => (
    <a
      href={`/bank/wyciagi?miesiac=${target}`}
      onClick={(e) => {
        e.preventDefault();
        ctx.navigate(`/bank/wyciagi?miesiac=${target}`);
      }}
    >
      {text}
    </a>
  );
  return (
    <main className={`${styles.main} _x1 mk-c-9f2__stmt`}>
      <h1>
        {t("bank.statements.heading")} {month}
      </h1>
      <div className={styles.pager}>
        {link(shiftMonth(month, -1), t("bank.statements.prev"))}
        {link(shiftMonth(month, 1), t("bank.statements.next"))}
        <a href={`/api/bank/statements/${month}.pdf`}>{t("bank.statements.pdf")}</a>
      </div>
      {ops?.length === 0 && <p>{t("bank.statements.empty")}</p>}
      {ops && ops.length > 0 && (
        <table className={styles.ops}>
          <tbody>
            {ops.map((o, i) => (
              <tr key={i}>
                <td>{o.date}</td>
                <td>{o.title}</td>
                <td>{o.amount_text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function History({ ctx, t }: { ctx: MountContext; t: T }) {
  useTitle(t("bank.title.history"));
  const [sid, setSid] = useState("");
  useEffect(() => {
    ctx
      .api("/api/session")
      .then((r) => (r.ok ? (r.json() as Promise<SessionInfo>) : null))
      .then((s) => setSid(s?.legacy_sid ?? ""))
      .catch(() => undefined);
  }, [ctx]);
  return (
    <main className={`${styles.main} _x1 mk-c-9f2__history`}>
      <h1>{t("bank.history.heading")}</h1>
      {sid && (
        <iframe
          className={styles.frame}
          title={t("bank.history.frame")}
          width="100%"
          height={600}
          src={`/legacy/bank/historia.do;jsessionid=${sid}`}
        />
      )}
    </main>
  );
}

export function App({ ctx }: { ctx: MountContext }) {
  const t = useCms();
  const full = useRoute(ctx);
  const url = new URL(full, "http://estate.local");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const guest = path === "/bank";
  let screen;
  if (guest) screen = <Home ctx={ctx} t={t} />;
  else if (path === "/bank/pulpit") screen = <Dashboard ctx={ctx} t={t} />;
  else if (path === "/bank/przelew") screen = <TransferForm ctx={ctx} t={t} />;
  else if (path === "/bank/przelew/potwierdzenie") screen = <Confirmation ctx={ctx} t={t} />;
  else if (path === "/bank/wyciagi")
    screen = <Statements ctx={ctx} t={t} query={url.searchParams} />;
  else if (path === "/bank/historia") screen = <History ctx={ctx} t={t} />;
  else screen = <Home ctx={ctx} t={t} />;
  return (
    <div className={`${styles.root} _x0 mk-c-9f2__root`}>
      {!guest && <Strip ctx={ctx} t={t} />}
      {screen}
    </div>
  );
}
