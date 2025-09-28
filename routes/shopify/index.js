import express from "express";
import productsRoutes from "./products.routes.js";
import cartRoutes from "./cart.routes.js";
import authRoutes from "./auth.routes.js";
import customerRoutes from "./customer.routes.js";
import graphQLClient from "../../utils/shopifyClient.js";
import reviewRoutes from "./reviews.routes.js";
const router = express.Router();

// Mount sub-routes
router.use("/products", productsRoutes);
router.use("/checkout", cartRoutes);
router.use("/", authRoutes); // Auth routes at root level
router.use("/customer", customerRoutes);
router.use("/reviews", reviewRoutes);
// Test endpoint to verify Shopify connection
router.get("/test-connection", async (req, res) => {
  try {
    const query = `
      query {
        shop {
          name
          primaryDomain {
            url
          }
        }
      }
    `;

    const data = await graphQLClient.request(query);

    res.json({
      success: true,
      shop: data.shop,
      message: "Shopify connection successful!",
    });
  } catch (error) {
    console.error("❌ Connection test failed:", error);
    res.status(500).json({
      success: false,
      error: "Failed to connect to Shopify",
      message: error.message,
    });
  }
});

export default router;
