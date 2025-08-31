// utils/preWarm.js
import cron from "node-cron";

export function setupPreWarming(graphQLClient, cache) {
  // Pre-warm cache every 4 minutes
  cron.schedule("*/4 * * * *", async () => {
    console.log("🔥 Pre-warming product cache...");

    try {
      const query = `
        {
          products(first: 250, sortKey: BEST_SELLING) {
            edges {
              node {
                id
                title
                handle
                priceRange {
                  minVariantPrice {
                    amount
                  }
                }
                featuredImage {
                  url(transform: {maxWidth: 150, maxHeight: 150, preferredContentType: WEBP})
                }
                availableForSale
              }
            }
          }
        }
      `;

      const data = await graphQLClient.request(query);

      const products = data.products.edges.map(({ node }) => ({
        id: node.id.split("/").pop(),
        title: node.title,
        handle: node.handle,
        price: parseFloat(node.priceRange.minVariantPrice.amount),
        image: node.featuredImage?.url || null,
        available: node.availableForSale,
      }));

      await cache.set("products:quick:v1", products, 300);
      console.log("✅ Cache pre-warmed with", products.length, "products");
    } catch (error) {
      console.error("❌ Pre-warming failed:", error.message);
    }
  });

  // Initial pre-warm on startup
  setTimeout(async () => {
    console.log("🚀 Initial cache warming...");
    try {
      const query = `
        {
          products(first: 250, sortKey: BEST_SELLING) {
            edges {
              node {
                id
                title
                handle
                priceRange {
                  minVariantPrice {
                    amount
                  }
                }
                featuredImage {
                  url(transform: {maxWidth: 150, maxHeight: 150, preferredContentType: WEBP})
                }
                availableForSale
              }
            }
          }
        }
      `;

      const data = await graphQLClient.request(query);
      const products = data.products.edges.map(({ node }) => ({
        id: node.id.split("/").pop(),
        title: node.title,
        handle: node.handle,
        price: parseFloat(node.priceRange.minVariantPrice.amount),
        image: node.featuredImage?.url || null,
        available: node.availableForSale,
      }));

      await cache.set("products:quick:v1", products, 300);
      console.log("✅ Initial cache warmed");
    } catch (error) {
      console.error("❌ Initial warming failed:", error.message);
    }
  }, 5000); // Wait 5 seconds after server start
}
