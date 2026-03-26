type RequestLike = unknown;
type ResponseLike = unknown;
type ExpressHandler = (req: RequestLike, res: ResponseLike) => unknown;
type ExpressAppLike = {
  use: (...args: unknown[]) => void;
  listen: (port: number, cb: (err?: unknown) => void) => void;
};

let appPromise: Promise<ExpressHandler> | null = null;

function loadApp(): Promise<ExpressHandler> {
  if (!appPromise) {
    appPromise = import("../apps/api/src/app.js").then(
      (module) => module.default as unknown as ExpressAppLike as unknown as ExpressHandler,
    );
  }
  return appPromise;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  const app = await loadApp();
  return app(req, res);
}
