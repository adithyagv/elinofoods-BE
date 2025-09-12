import express from "express";
import shopifyRoutes from "./shopify/index.js";
import adminroutes from "./admin/index.js"


const router = express.Router();

// Mount all Shopify routes
router.use("/", shopifyRoutes);
router.use("/admin", adminroutes)


export default router;
