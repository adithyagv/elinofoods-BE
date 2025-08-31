import express from "express";
import graphQLClient from "../../utils/shopifyClient.js";

const router = express.Router();

// Cache for products (in-memory cache)
let productsCache = {
  data: null,
  timestamp: null,
  ttl: 5 * 60 * 1000, // 5 minutes cache
};

router.get("/quick", async (req, res) => {
  const cache = req.cache;
  const cacheKey = "products:quick";

  try {
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log("⚡ Returning cached products");
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    // Optimized query - only essential fields
    const query = `
      {
        products(first: 100, sortKey: BEST_SELLING) {
          edges {
            node {
              id
              title
              handle
              priceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              featuredImage {
                url(transform: {maxWidth: 200, maxHeight: 200, preferredContentType: WEBP})
              }
              availableForSale
            }
          }
        }
      }
    `;

    console.log("🔍 Fetching products from Shopify...");
    const data = await graphQLClient.request(query);

    // Transform to lighter format
    const products = data.products.edges.map(({ node }) => ({
      id: node.id.split("/").pop(), // Shorter ID
      title: node.title,
      handle: node.handle,
      price: {
        amount: parseFloat(node.priceRange.minVariantPrice.amount),
        currency: node.priceRange.minVariantPrice.currencyCode,
      },
      image: node.featuredImage?.url || null,
      available: node.availableForSale,
    }));

    // Cache for 5 minutes
    cache.set(cacheKey, products, 300);

    console.log(`✅ Fetched ${products.length} products`);
    res.set("X-Cache", "MISS");
    res.json(products);
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// OPTIMIZED: Original products endpoint with better query
router.get("/", async (req, res) => {
  const { limit = 20, sortKey = "UPDATED_AT", reverse = true } = req.query;

  const query = `
    query getProducts($first: Int!, $sortKey: ProductSortKeys!, $reverse: Boolean!) {
      products(first: $first, sortKey: $sortKey, reverse: $reverse) {
        edges {
          node {
            id
            title
            description
            handle
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            images(first: 1) {
              edges {
                node {
                  url(transform: {maxWidth: 400, maxHeight: 400})
                  altText
                }
              }
            }
            variants(first: 5) {
              edges {
                node {
                  id
                  title
                  price {
                    amount
                    currencyCode
                  }
                  availableForSale
                }
              }
            }
            availableForSale
          }
        }
      }
    }
  `;

  try {
    const data = await graphQLClient.request(query, {
      first: parseInt(limit),
      sortKey,
      reverse: reverse === "true",
    });

    res.json(data.products.edges);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// OPTIMIZED: Product by handle with selective loading
router.get("/:handle", async (req, res) => {
  const { handle } = req.params;
  const cache = req.cache;
  const cacheKey = `product:${handle}`;

  try {
    // Check cache
    const cached = cache.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    const query = `
      query getProduct($handle: String!) {
        product(handle: $handle) {
          id
          title
          description
          handle
          featuredImage {
            url(transform: {maxWidth: 800, maxHeight: 800, preferredContentType: WEBP})
          }
          images(first: 5) {
            edges {
              node {
                url(transform: {maxWidth: 800, maxHeight: 800, preferredContentType: WEBP})
                altText
              }
            }
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                price {
                  amount
                  currencyCode
                }
                availableForSale
              }
            }
          }
          availableForSale
        }
      }
    `;

    const data = await graphQLClient.request(query, { handle });

    if (!data.product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Cache for 10 minutes
    cache.set(cacheKey, data.product, 600);

    res.set("X-Cache", "MISS");
    res.json(data.product);
  } catch (error) {
    console.error("❌ Error fetching product:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// BATCH PRODUCTS BY HANDLES (NEW - for fast loading specific products)
router.post("/batch", async (req, res) => {
  try {
    const { handles } = req.body;

    if (!handles || !Array.isArray(handles)) {
      return res.status(400).json({ error: "handles array is required" });
    }

    // Build query for multiple products
    const queries = handles
      .map(
        (handle, index) => `
      product${index}: product(handle: "${handle}") {
        id
        title
        handle
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        images(first: 1) {
          edges {
            node {
              url(transform: {maxWidth: 300, maxHeight: 300})
              altText
            }
          }
        }
        availableForSale
      }
    `
      )
      .join("\n");

    const query = `
      query {
        ${queries}
      }
    `;

    const data = await graphQLClient.request(query);

    // Transform response to array
    const products = Object.values(data).filter((product) => product !== null);

    res.json(products);
  } catch (error) {
    console.error("❌ Error batch fetching products:", error);
    res.status(500).json({ error: "Failed to batch fetch products" });
  }
});

// SEARCH PRODUCTS (NEW - optimized search)
router.get("/search", async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q) {
      return res.status(400).json({ error: "Search query 'q' is required" });
    }

    const query = `
      query searchProducts($query: String!, $first: Int!) {
        products(first: $first, query: $query, sortKey: RELEVANCE) {
          edges {
            node {
              id
              title
              handle
              priceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              images(first: 1) {
                edges {
                  node {
                    url(transform: {maxWidth: 300, maxHeight: 300})
                    altText
                  }
                }
              }
              availableForSale
            }
          }
        }
      }
    `;

    const data = await graphQLClient.request(query, {
      query: q,
      first: parseInt(limit),
    });

    const products = data.products.edges.map(({ node }) => ({
      id: node.id,
      title: node.title,
      handle: node.handle,
      price: node.priceRange.minVariantPrice,
      image: node.images.edges[0]?.node || null,
      availableForSale: node.availableForSale,
    }));

    res.json(products);
  } catch (error) {
    console.error("❌ Error searching products:", error);
    res.status(500).json({ error: "Failed to search products" });
  }
});

// PAGINATION ENDPOINT (NEW - for infinite scroll)
router.get("/paginated", async (req, res) => {
  try {
    const { cursor, limit = 20 } = req.query;

    let paginationArgs = `first: ${parseInt(limit)}`;
    if (cursor) {
      paginationArgs += `, after: "${cursor}"`;
    }

    const query = `
      query {
        products(${paginationArgs}, sortKey: UPDATED_AT, reverse: true) {
          edges {
            cursor
            node {
              id
              title
              handle
              priceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              images(first: 1) {
                edges {
                  node {
                    url(transform: {maxWidth: 300, maxHeight: 300})
                    altText
                  }
                }
              }
              availableForSale
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;

    const data = await graphQLClient.request(query);

    const products = data.products.edges.map(({ node, cursor }) => ({
      cursor,
      ...node,
      price: node.priceRange.minVariantPrice,
      image: node.images.edges[0]?.node || null,
    }));

    res.json({
      products,
      pageInfo: data.products.pageInfo,
    });
  } catch (error) {
    console.error("❌ Error fetching paginated products:", error);
    res.status(500).json({ error: "Failed to fetch paginated products" });
  }
});

// Clear cache endpoint (for development)
router.post("/cache/clear", (req, res) => {
  req.cache.clear();
  res.json({ success: true, message: "Cache cleared" });
});

export default router;
