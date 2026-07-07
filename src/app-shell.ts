import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Router } from "@lit-labs/router";
import { getStats } from "./db/document-store.ts";
import { seedCategories, getSettings } from "./db/config-store.ts";

@customElement("app-shell")
export class AppShell extends LitElement {
  createRenderRoot() {
    return this;
  }

  @state() private sidebarOpen = false;
  @state() private urgentCount = 0;
  @state() private currentPath = window.location.pathname;
  private _base = import.meta.env.BASE_URL.replace(/\/$/, '');

  private _router = new Router(this, [
    { path: this._base + '/', render: () => html`<dashboard-page></dashboard-page>` },
    { path: this._base + '/scan', render: () => html`<scan-page></scan-page>` },
    { path: this._base + '/library', render: () => html`<library-page></library-page>` },
    { path: this._base + '/library/:id', render: () => html`<document-detail></document-detail>` },
    { path: this._base + '/settings', render: () => html`<settings-page></settings-page>` },
  ]);

  async connectedCallback() {
    super.connectedCallback();

    const settings = await getSettings();
    document.documentElement.setAttribute("data-theme", settings.theme);

    await seedCategories();

    this._refreshUrgent();

    window.addEventListener("navigate", ((e: CustomEvent) => {
      const path = e.detail.path;
      const fullPath = this._base + path;
      window.history.pushState({}, "", fullPath);
      this._router.goto(fullPath);
      this.currentPath = fullPath;
      this.sidebarOpen = false;
    }) as EventListener);

    window.addEventListener("popstate", () => {
      const path = window.location.pathname;
      this.currentPath = path;
    });
  }

  private async _refreshUrgent() {
    const stats = await getStats();
    this.urgentCount = stats.urgent;
  }

  private _navigate(path: string) {
    const fullPath = this._base + path;
    window.history.pushState({}, "", fullPath);
    this._router.goto(fullPath);
    this.currentPath = fullPath;
    this.sidebarOpen = false;
  }

  private _isActive(path: string) {
    const fullPath = this._base + path;
    return this.currentPath === fullPath || this.currentPath.startsWith(fullPath + "/");
  }

  render() {
    return html`
      <div
        class="overlay hidden md:hidden ${this.sidebarOpen ? "!block" : ""}"
        @click=${() => (this.sidebarOpen = false)}
      ></div>

      <aside
        class="sidebar bg-base-200 border-r border-base-300 flex flex-col ${this
          .sidebarOpen
          ? "open"
          : ""}"
      >
          <div class="p-4 border-b border-base-300">
            <h1 class="text-xl font-bold flex items-center gap-2">
              <icon-svg name="logo" size="32"></icon-svg>
              Doculium
            </h1>
          </div>

        <nav class="flex-1 p-2 space-y-1">
          <button
            class="w-full btn btn-ghost justify-start gap-3 ${this._isActive(
              "/",
            )
              ? "btn-active"
              : ""}"
            @click=${() => this._navigate("/")}
          >
            <icon-svg name="dashboard" size="20"></icon-svg>
            Dashboard
          </button>

          <button
            class="w-full btn btn-ghost justify-start gap-3 ${this._isActive(
              "/scan",
            )
              ? "btn-active"
              : ""}"
            @click=${() => this._navigate("/scan")}
          >
            <icon-svg name="scan" size="20"></icon-svg>
            Scan
          </button>

          <button
            class="w-full btn btn-ghost justify-start gap-3 ${this._isActive(
              "/library",
            )
              ? "btn-active"
              : ""}"
            @click=${() => this._navigate("/library")}
          >
            <icon-svg name="library" size="20"></icon-svg>
            Library
          </button>

          <button
            class="w-full btn btn-ghost justify-start gap-3 ${this._isActive(
              "/settings",
            )
              ? "btn-active"
              : ""}"
            @click=${() => this._navigate("/settings")}
          >
            <icon-svg name="settings" size="20"></icon-svg>
            Settings
          </button>
        </nav>

        <div class="p-4 border-t border-base-300 text-xs opacity-50">
          ${this.urgentCount > 0
            ? html`<span class="badge badge-error badge-xs"
                >${this.urgentCount} urgent</span
              >`
            : ""}
          <p class="mt-1">Doculium v1.0</p>
        </div>
      </aside>

      <main class="flex-1 overflow-y-auto bg-base-100">
        <div
          class="md:hidden sticky top-0 z-30 bg-base-200 border-b border-base-300 p-3 flex items-center gap-3"
        >
          <button
            class="tooltip btn btn-square btn-sm btn-ghost"
            data-tip="Menu"
            @click=${() => (this.sidebarOpen = !this.sidebarOpen)}
          >
            <icon-svg name="hamburger" size="20"></icon-svg>
          </button>
          <icon-svg name="logo" size="24"></icon-svg>
          <span class="font-semibold">Doculium</span>
        </div>
        ${this._router.outlet()}
      </main>
    `;
  }
}
