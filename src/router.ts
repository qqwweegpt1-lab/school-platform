import type { Ctx } from './http.ts';

export type Handler = (ctx: Ctx) => void | Promise<void>;
export interface Route {
  method: 'GET' | 'POST';
  pattern: string;
  handler: Handler;
  /** المسارات التي تستقبل ملفات (multipart) بحد أكبر للجسم */
  bigBody?: boolean | 'media';
}

interface Compiled extends Route {
  re: RegExp;
  keys: string[];
}

export class Router {
  private routes: Compiled[] = [];
  add(routes: Route[]) {
    for (const r of routes) {
      const keys: string[] = [];
      const re = new RegExp(
        '^' +
          r.pattern.replace(/:([a-z]+)/gi, (_m, k) => {
            keys.push(k);
            return '([^/]+)';
          }) +
          '/?$',
      );
      this.routes.push({ ...r, re, keys });
    }
  }
  match(method: string, path: string): { route: Route; params: Record<string, string> } | null {
    const m = method === 'HEAD' ? 'GET' : method;
    for (const r of this.routes) {
      if (r.method !== m) continue;
      const x = r.re.exec(path);
      if (!x) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(x[i + 1])));
      return { route: r, params };
    }
    return null;
  }
  /** هل المسار موجود بطريقة أخرى؟ (لإرجاع 405) */
  pathExists(path: string): boolean {
    return this.routes.some((r) => r.re.test(path));
  }
}
