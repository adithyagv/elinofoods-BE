import express from "express";
import productsRoutes from "./products.routes.js";
import customerRoutes from "./customer.routes.js";
import ingredientsRoutes from "./ingredients.routes.js";
import  revenueRoutes from "./revenue.routes.js"

import graphQLClient from "../../utils/shopifyClient.js";

const router = express.Router();

// Mount sub-routes
router.use("/products", productsRoutes);
router.use("/customer", customerRoutes);
router.use("/ingredients", ingredientsRoutes);
router.use("/revenue",revenueRoutes)





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
