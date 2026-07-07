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
              <logo-icon size="32"></logo-icon>
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              <path d="M16 5l-4 4m0 0l-4-4m4 4V1" />
            </svg>
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path
                d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
              />
            </svg>
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
              />
            </svg>
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <logo-icon size="24"></logo-icon>
          <span class="font-semibold">Doculium</span>
        </div>
        ${this._router.outlet()}
      </main>
    `;
  }
}
