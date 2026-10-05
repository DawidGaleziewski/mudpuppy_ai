import { api, navigate, on } from "./bus";

/**
 * `<mk-mini-cart>`: the header cart as a custom element with an OPEN shadow root (LO-05). The
 * count comes from the shop's cart and from `pg:cart-changed`, which the shop app fires (LO-34).
 */
class MiniCart extends HTMLElement {
  private count = 0;
  private off: (() => void) | null = null;

  connectedCallback(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      a{color:var(--brand);font:var(--weight-medium) var(--text-body)/1 var(--font-mono);
        text-decoration:none;border:var(--hairline) solid var(--border);padding:var(--space-2) var(--space-3);
        display:inline-block}
      a:hover{border-color:var(--brand)}
    </style><a href="/sklep/koszyk" part="link"></a>`;
    root.querySelector("a")!.addEventListener("click", (e) => {
      e.preventDefault();
      navigate("/sklep/koszyk");
    });
    this.render();
    this.off = on("cart-changed", (d) => {
      const n = (d as { count?: number } | undefined)?.count;
      if (typeof n === "number") {
        this.count = n;
        this.render();
      }
    });
    void api("/api/shop/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationName: "Cart", variables: {} }),
    })
      .then((r) => r.json())
      .then((j) => {
        const n = j?.data?.cart?.count;
        if (typeof n === "number") {
          this.count = n;
          this.render();
        }
      })
      .catch(() => undefined);
  }

  disconnectedCallback(): void {
    this.off?.();
  }

  private render(): void {
    const a = this.shadowRoot?.querySelector("a");
    if (a) a.textContent = `Koszyk (${this.count})`;
  }
}

if (!customElements.get("mk-mini-cart")) customElements.define("mk-mini-cart", MiniCart);
