type RouteRender = () => unknown;

interface Route {
  pattern: URLPattern;
  render: RouteRender;
}

export class SimpleRouter extends EventTarget {
  private routes: Route[] = [];
  private _currentPath = '';

  constructor() {
    super();
    window.addEventListener('popstate', () => this._notify());
    window.addEventListener('navigate', ((e: CustomEvent) => {
      const path = e.detail.path;
      this.go(path);
    }) as EventListener);
  }

  setRoutes(defs: { path: string; render: RouteRender }[]): void {
    this.routes = defs.map(d => ({
      pattern: new URLPattern({ pathname: d.path }),
      render: d.render,
    }));
    this._notify();
  }

  get currentPath(): string {
    return this._currentPath;
  }

  go(path: string): void {
    window.history.pushState({}, '', path);
    this._notify();
  }

  get currentRoute(): RouteRender | null {
    for (const route of this.routes) {
      if (route.pattern.test(window.location.href)) {
        return route.render;
      }
    }
    return null;
  }

  private _notify(): void {
    this._currentPath = window.location.pathname;
    this.dispatchEvent(new CustomEvent('route-change'));
  }
}

export const router = new SimpleRouter();
