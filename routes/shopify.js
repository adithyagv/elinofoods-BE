import express from "express";
import shopifyRoutes from "./shopify/index.js";

const router = express.Router();

// Mount all Shopify routes
router.use("/", shopifyRoutes);

export default router;
