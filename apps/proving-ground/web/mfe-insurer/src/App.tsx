import { useEffect, useState } from "react";
import s from "./App.module.css";
import { Addons, Detail, Done, Guest, Policies } from "./Screens";
import { useCms } from "./support";
import { Wizard } from "./Wizard";

// Hash routing (LO-06): the route is whatever follows "#" in the address.
function readRoute(): string {
  const h = window.location.hash;
  return h.startsWith("#/") ? h.slice(1) : "/";
}

export function App() {
  const t = useCms();
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const [pathPart = "/", query = ""] = route.split("?");
  const parts = pathPart.split("/").filter(Boolean);

  let screen;
  if (parts[0] === "polisy" && parts[1] && parts[2] === "dodatki") {
    screen = <Addons nr={parts[1]} />;
  } else if (parts[0] === "polisy" && parts[1]) {
    screen = <Detail nr={parts[1]} />;
  } else if (parts[0] === "polisy") {
    screen = <Policies />;
  } else if (parts[0] === "szkody" && parts[1] === "nowa") {
    screen = <Wizard urlStep={Number(parts[2] ?? 1) || 1} />;
  } else if (parts[0] === "szkody" && parts[1] === "potwierdzenie") {
    screen = <Done nr={new URLSearchParams(query).get("nr") ?? ""} />;
  } else {
    screen = <Guest />;
  }

  return (
    <div className={`${s.root} _x1 mk-ins-7a1__root`}>
      {parts.length > 0 && (
        <div className={s.nav}>
          <a href="#/polisy">{t("nav.polisy")}</a>
          <a href="#/szkody/nowa">{t("nav.claim")}</a>
        </div>
      )}
      {screen}
    </div>
  );
}
