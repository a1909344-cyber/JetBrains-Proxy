import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import authRouter, { requireAdmin } from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

// Guard: requireAdmin runs for every /admin/* request before the handler
router.use("/admin", requireAdmin);

// Admin routes already include "/admin" in their paths
router.use(adminRouter);

export default router;
