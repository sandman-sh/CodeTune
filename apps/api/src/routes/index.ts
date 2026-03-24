import { Router, type IRouter } from "express";
import healthRouter from "./health";
import soundtracksRouter from "./soundtracks";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/soundtracks", soundtracksRouter);
router.use("/codetune", soundtracksRouter);

export default router;
