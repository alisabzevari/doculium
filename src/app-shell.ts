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

  private _router = new Router(this, [
    { path: "/", render: () => html`<dashboard-page></dashboard-page>` },
    { path: "/scan", render: () => html`<scan-page></scan-page>` },
    { path: "/library", render: () => html`<library-page></library-page>` },
    {
      path: "/library/:id",
      render: () => html`<document-detail></document-detail>`,
    },
    { path: "/settings", render: () => html`<settings-page></settings-page>` },
  ]);

  async connectedCallback() {
    super.connectedCallback();

    const settings = await getSettings();
    document.documentElement.setAttribute("data-theme", settings.theme);

    await seedCategories();

    this._refreshUrgent();

    window.addEventListener("navigate", ((e: CustomEvent) => {
      const path = e.detail.path;
      window.history.pushState({}, "", path);
      this._router.goto(path);
      this.currentPath = path;
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
    window.history.pushState({}, "", path);
    this._router.goto(path);
    this.currentPath = path;
    this.sidebarOpen = false;
  }

  private _isActive(path: string) {
    return this.currentPath === path || this.currentPath.startsWith(path + "/");
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-8 h-8"
              viewBox="0 0 32 32"
              fill="none"
            >
              <rect width="32" height="32" rx="7" fill="var(--color-primary)" />
              <rect
                x="7"
                y="6"
                width="16"
                height="20"
                rx="3"
                fill="var(--color-primary-content)"
              />
              <path
                d="M23 12h-5a1.5 1.5 0 0 1-1.5-1.5V6"
                fill="var(--color-base-content)"
                opacity="0.15"
              />
              <path
                d="M23 12h-5a1.5 1.5 0 0 1-1.5-1.5V6l6.5 6Z"
                fill="var(--color-base-content)"
                opacity="0.08"
              />
              <rect
                x="10"
                y="15"
                width="10"
                height="1.2"
                rx="0.6"
                fill="var(--color-primary)"
                opacity="0.5"
              />
              <rect
                x="10"
                y="19"
                width="7.5"
                height="1.2"
                rx="0.6"
                fill="var(--color-primary)"
                opacity="0.3"
              />
              <rect
                x="10"
                y="23"
                width="8.5"
                height="1.2"
                rx="0.6"
                fill="var(--color-primary)"
                opacity="0.3"
              />
            </svg>
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-6 h-6"
            viewBox="0 0 32 32"
            fill="none"
          >
            <rect width="32" height="32" rx="7" fill="var(--color-primary)" />
            <rect
              x="7"
              y="6"
              width="16"
              height="20"
              rx="3"
              fill="var(--color-primary-content)"
            />
            <rect
              x="10"
              y="15"
              width="10"
              height="1.2"
              rx="0.6"
              fill="var(--color-primary)"
              opacity="0.5"
            />
            <rect
              x="10"
              y="19"
              width="7.5"
              height="1.2"
              rx="0.6"
              fill="var(--color-primary)"
              opacity="0.3"
            />
            <rect
              x="10"
              y="23"
              width="8.5"
              height="1.2"
              rx="0.6"
              fill="var(--color-primary)"
              opacity="0.3"
            />
          </svg>
          <span class="font-semibold">Doculium</span>
        </div>
        ${this._router.outlet()}
      </main>
    `;
  }
}
