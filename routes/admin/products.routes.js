// routes/products.js
import express from "express";
import graphQLClient from "../../utils/shopifyClient.js";

const router = express.Router();

// ✅ Get list of products
router.get("/", async (req, res) => {
  const { limit = 20, reverse = true } = req.query;

  const query = `
    query getProducts($first: Int!, $reverse: Boolean!) {
      products(first: $first, reverse: $reverse) {
        edges {
          node {
            id
            title
            description
            handle
            availableForSale
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            images(first: 1) {
              edges {
                node {
                  url(transform: { maxWidth: 400, maxHeight: 400 })
                  altText
                }
              }
            }
            variants(first: 5) {
              edges {
                node {
                  id
                  title
                  availableForSale
                  price {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await graphQLClient.request(query, {
      first: parseInt(limit),
      reverse: reverse === "true",
    });

    const products = data.products.edges.map(edge => edge.node);
    console.log(`✅ Fetched ${products.length} products`);
    res.json({ success: true, products });
  } catch (error) {
    console.error("❌ Error fetching products:", JSON.stringify(error, null, 2));
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// ✅ Get single product by handle
router.get("/:handle", async (req, res) => {
  const { handle } = req.params;

  const query = `
    query getProduct($handle: String!) {
      product(handle: $handle) {
        id
        title
        description
        handle
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
              availableForSale
              price {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await graphQLClient.request(query, { handle });

    if (!data.product) {
      return res.status(404).json({ error: "Product not found" });
    }

    console.log(`✅ Fetched product: ${data.product.title}`);
    res.json({ success: true, product: data.product });
  } catch (error) {
    console.error("❌ Error fetching product by handle:", JSON.stringify(error, null, 2));
    res.status(500).json({ error: "Failed to fetch product by handle" });
  }
});

export default router;
