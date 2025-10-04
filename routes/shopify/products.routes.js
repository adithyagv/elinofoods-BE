import express from "express";
import graphQLClient from "../../utils/shopifyClient.js";

const router = express.Router();

// Cache for products (in-memory cache)
let productsCache = {
  data: null,
  timestamp: null,
  ttl: 5 * 60 * 1000, // 5 minutes cache
};

// Quick products endpoint (cached)
router.get("/quick", async (req, res) => {
  const cache = req.cache;
  const cacheKey = "products:quick";

  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log("⚡ Returning cached products");
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

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

    const products = data.products.edges.map(({ node }) => ({
      id: node.id.split("/").pop(),
      title: node.title,
      handle: node.handle,
      price: {
        amount: parseFloat(node.priceRange.minVariantPrice.amount),
        currency: node.priceRange.minVariantPrice.currencyCode,
      },
      image: node.featuredImage?.url || null,
      available: node.availableForSale,
    }));

    cache.set(cacheKey, products, 300);

    console.log(`✅ Fetched ${products.length} products`);
    res.set("X-Cache", "MISS");
    res.json(products);
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// Search products endpoint
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

    console.log(`✅ Search returned ${products.length} products`);
    res.json(products);
  } catch (error) {
    console.error("❌ Error searching products:", error);
    res.status(500).json({ error: "Failed to search products" });
  }
});

// Batch products endpoint
router.post("/batch", async (req, res) => {
  try {
    const { identifiers, type = "id" } = req.body;

    if (!identifiers || !Array.isArray(identifiers)) {
      return res.status(400).json({ error: "identifiers array is required" });
    }

    let queries = "";

    if (type === "handle") {
      queries = identifiers
        .map(
          (handle, index) => `
          product${index}: productByHandle(handle: "${handle}") {
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
    } else {
      // For IDs
      queries = identifiers
        .map((id, index) => {
          const gid = id.includes("gid://")
            ? id
            : `gid://shopify/Product/${id}`;
          return `
            product${index}: product(id: "${gid}") {
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
          `;
        })
        .join("\n");
    }

    const query = `
      query {
        ${queries}
      }
    `;

    const data = await graphQLClient.request(query);
    const products = Object.values(data).filter((product) => product !== null);

    console.log(`✅ Batch fetched ${products.length} products`);
    res.json(products);
  } catch (error) {
    console.error("❌ Error batch fetching products:", error);
    res.status(500).json({ error: "Failed to batch fetch products" });
  }
});

// Get all products with optional category filter
router.get("/", async (req, res) => {
  const {
    limit = 20,
    sortKey = "UPDATED_AT",
    reverse = true,
    category,
  } = req.query;

  try {
    let query;
    let variables = {
      first: parseInt(limit),
      sortKey,
      reverse: reverse === "true",
    };

    if (category) {
      // Map URL-friendly category names to actual product types/tags
      const categoryMap = {
        "bar-blast": "Bar Blast",
        "fruit-jerky": "Fruit Jerky",
      };

      const categoryName = categoryMap[category] || category;

      // Use search query to filter by product type or tag
      query = `
        query getProducts($first: Int!, $sortKey: ProductSortKeys!, $reverse: Boolean!, $query: String!) {
          products(first: $first, sortKey: $sortKey, reverse: $reverse, query: $query) {
            edges {
              node {
                id
                title
                description
                handle
                productType
                tags
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

      variables.query = `product_type:"${categoryName}" OR tag:"${categoryName}"`;
    } else {
      query = `
        query getProducts($first: Int!, $sortKey: ProductSortKeys!, $reverse: Boolean!) {
          products(first: $first, sortKey: $sortKey, reverse: $reverse) {
            edges {
              node {
                id
                title
                description
                handle
                productType
                tags
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
    }

    const data = await graphQLClient.request(query, variables);

    console.log(
      `✅ Fetched ${data.products.edges.length} products${
        category ? ` for category: ${category}` : ""
      }`
    );
    res.json(data.products.edges);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// Product by numeric ID - SPECIFIC ROUTE
router.get("/id/:id", async (req, res) => {
  const { id } = req.params;
  const cache = req.cache;
  const gid = `gid://shopify/Product/${id}`;
  const cacheKey = `product:id:${id}`;

  console.log(`📦 Fetching product by ID: ${id}`);

  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`⚡ Returning cached product for id: ${id}`);
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    const query = `
      query getProductById($id: ID!) {
        product(id: $id) {
          id
          title
          description
          handle
          productType
          tags
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

    const data = await graphQLClient.request(query, { id: gid });

    if (!data.product) {
      return res.status(404).json({ error: "Product not found" });
    }

    cache.set(cacheKey, data.product, 600);

    console.log(`✅ Fetched product for id: ${id}`);
    res.set("X-Cache", "MISS");
    res.json(data.product);
  } catch (error) {
    console.error("❌ Error fetching product by ID:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// Product by handle - SPECIFIC ROUTE
router.get("/handle/:handle", async (req, res) => {
  const { handle } = req.params;
  const cache = req.cache;
  const cacheKey = `product:handle:${handle}`;

  console.log(`📦 Fetching product by handle: ${handle}`);

  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`⚡ Returning cached product for handle: ${handle}`);
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    const query = `
      query getProductByHandle($handle: String!) {
        productByHandle(handle: $handle) {
          id
          title
          description
          handle
          productType
          tags
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

    if (!data.productByHandle) {
      return res.status(404).json({ error: "Product not found" });
    }

    cache.set(cacheKey, data.productByHandle, 600);

    console.log(`✅ Fetched product for handle: ${handle}`);
    res.set("X-Cache", "MISS");
    res.json(data.productByHandle);
  } catch (error) {
    console.error("❌ Error fetching product by handle:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// Generic product route - handles both ID and handle (FALLBACK)
router.get("/:identifier", async (req, res) => {
  const { identifier } = req.params;

  console.log(`🔍 Determining type for identifier: ${identifier}`);

  // Check if it's a numeric ID
  if (/^\d+$/.test(identifier)) {
    console.log(`✅ Identifier is numeric, treating as ID`);
    req.params.id = identifier;
    return router.handle(req, res, () => {}, "/id/:id");
  } else {
    console.log(`✅ Identifier is not numeric, treating as handle`);
    req.params.handle = identifier;
    return router.handle(req, res, () => {}, "/handle/:handle");
  }
});

// Clear cache endpoint
router.post("/cache/clear", (req, res) => {
  req.cache.clear();
  console.log("🗑️ Cache cleared");
  res.json({ success: true, message: "Cache cleared" });
});

export default router;
