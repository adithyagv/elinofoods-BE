import express from "express";
import graphQLClient from "../../utils/shopifyClient.js";

const router = express.Router();

// ✅ Get list of products
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

    console.log(`✅ Fetched ${data.products.edges.length} products`);
    res.json(data.products.edges);
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// ✅ Get single product by ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Ensure ID is in Shopify GID format
    const productGID = id.startsWith("gid://")
      ? id
      : `gid://shopify/Product/${id}`;

    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          description
          handle
          vendor
          productType
          availableForSale
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 5) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                sku
                price {
                  amount
                  currencyCode
                }
                availableForSale
              }
            }
          }
        }
      }
    `;

    const data = await graphQLClient.request(query, { id: productGID });

    if (!data.product) {
      return res.status(404).json({ error: "Product not found" });
    }

    console.log(`✅ Fetched product: ${data.product.title}`);
    res.json(data.product);
  } catch (error) {
    console.error("❌ Error fetching product by ID:", error);
    res.status(500).json({ error: "Failed to fetch product by ID" });
  }
});

export default router;
