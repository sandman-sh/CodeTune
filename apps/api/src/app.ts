import { createRequire } from "node:module";
import type { Express } from "express";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const require = createRequire(import.meta.url);
const express = require("express") as typeof import("express").default;
const cors = require("cors") as typeof import("cors").default;
const pinoHttp = require("pino-http") as typeof import("pino-http").default;

const app: Express = express();

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
