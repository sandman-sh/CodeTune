import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import soundtracksRouter from "./soundtracks.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/soundtracks", soundtracksRouter);
router.use("/codetune", soundtracksRouter);

export default router;
