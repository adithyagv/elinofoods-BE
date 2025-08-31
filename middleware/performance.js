// middleware/performance.js
import compression from "compression";

export function setupPerformanceMiddleware(app) {
  // Enable gzip compression
  app.use(compression());

  // Set cache headers for product endpoints
  app.use("/api/products", (req, res, next) => {
    res.set({
      "Cache-Control": "public, max-age=60, s-maxage=300",
      "CDN-Cache-Control": "max-age=300",
    });
    next();
  });
}
