import { Router } from "express";
import healthRouter from "./health.js";
import repoAssistantRouter from "./repo-assistant.js";
import soundtracksRouter from "./soundtracks.js";

const router = Router();

router.use(healthRouter);
router.use(repoAssistantRouter);
router.use("/soundtracks", soundtracksRouter);
router.use("/codetune", soundtracksRouter);

export default router;
