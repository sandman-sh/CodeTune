import { createRequire } from "node:module";
import type { RequestHandler } from "express";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const require = createRequire(import.meta.url);
type ExpressModule = {
  (): {
    use: (...args: unknown[]) => void;
  };
  json: () => RequestHandler;
  urlencoded: (options: { extended: boolean }) => RequestHandler;
};

const express = require("express") as ExpressModule;
const cors = require("cors") as () => RequestHandler;
const pinoHttp = require("pino-http") as (options: {
  logger: typeof logger;
  serializers: {
    req: (req: { id?: string; method?: string; url?: string }) => { id?: string; method?: string; url?: string };
    res: (res: { statusCode?: number }) => { statusCode?: number };
  };
}) => RequestHandler;

const app = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: { id?: string; method?: string; url?: string }) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: { statusCode?: number }) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
