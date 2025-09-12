// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import compression from "compression";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import shopifyRoutes from "./routes/shopify.js";
import { connectDB,newclient } from "./routes/admin/mongodbconnection.js";

// Resolve __dirname (needed for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();

// In-memory cache
const memoryCache = new Map();
const memoryCacheTTL = new Map();
connectDB();
// Simple cache implementation
const cache = {
  get(key) {
    const ttl = memoryCacheTTL.get(key);
    if (ttl && Date.now() > ttl) {
      memoryCache.delete(key);
      memoryCacheTTL.delete(key);
      return null;
    }
    return memoryCache.get(key) || null;
  },

  set(key, value, ttlSeconds = 300) {
    memoryCache.set(key, value);
    memoryCacheTTL.set(key, Date.now() + ttlSeconds * 1000);
  },

  del(key) {
    memoryCache.delete(key);
    memoryCacheTTL.delete(key);
  },

  clear() {
    memoryCache.clear();
    memoryCacheTTL.clear();
  },
};

// Make cache available globally
app.locals.cache = cache;

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Compression middleware - reduces response size
app.use(compression());

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
  })
);

// Body parsing
app.use(express.json());

// Request logging in development
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      console.log(
        `📨 ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`
      );
    });
    next();
  });
}

// Cache headers for product endpoints
app.use("/api/shopify/products", (req, res, next) => {
  res.set({
    "Cache-Control": "public, max-age=60",
    "X-Content-Type-Options": "nosniff",
  });
  next();
});


// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: Date.now(),
    cache: {
      size: memoryCache.size,
      type: "memory",
    },
  });
});

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "Elino Foods Backend API is running 🚀",
    version: "1.0",
  });
});
await connectDB();

// get database instance
const db = newclient.db("elinofoods");
// Shopify routes with cache middleware
app.use(
  "/api/shopify",
  (req, res, next) => {
    req.cache = cache;
    req.db = db;  // 👈 attach db to request

    next();

  },
  shopifyRoutes
);



// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.stack);
  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

// Clear cache periodically to prevent memory bloat
setInterval(() => {
  const now = Date.now();
  for (const [key, ttl] of memoryCacheTTL.entries()) {
    if (now > ttl) {
      memoryCache.delete(key);
      memoryCacheTTL.delete(key);
    }
  }
}, 60000); // Clean up every minute

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📦 Using in-memory cache`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("👋 SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("🛑 HTTP server closed");
    process.exit(0);
  });
});

export default app;
