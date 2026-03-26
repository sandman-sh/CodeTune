type RequestLike = unknown;
type ResponseLike = unknown;
type ExpressHandler = (req: RequestLike, res: ResponseLike) => unknown;

let appPromise: Promise<ExpressHandler> | null = null;

function loadApp(): Promise<ExpressHandler> {
  if (!appPromise) {
    appPromise = import("../apps/api/src/app.js").then((module) => module.default as ExpressHandler);
  }
  return appPromise;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  const app = await loadApp();
  return app(req, res);
}
