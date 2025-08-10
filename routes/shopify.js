import express from "express";
import graphQLClient from "../utils/shopifyClient.js";

const router = express.Router();

// getProducts
router.get("/products", async (req, res) => {
  const query = `
    {
      products(first: 20) {
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
      }
    }
  `;
  try {
    const data = await graphQLClient.request(query);
    res.json(data.products.edges);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// getProduct by handle - FIXED QUERY
router.get("/products/:handle", async (req, res) => {
  const { handle } = req.params;
  console.log("🎯 Route: Fetching product with handle:", handle);

  const query = `
    query getProduct($handle: String!) {
      product(handle: $handle) {
        id
        title
        description
        handle
        images(first: 10) {
          edges {
            node {
              url
              altText
            }
          }
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
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
              compareAtPrice {
                amount
                currencyCode
              }
              availableForSale
              quantityAvailable
              selectedOptions {
                name
                value
              }
            }
          }
        }
        options {
          id
          name
          values
        }
        tags
      }
    }
  `;

  try {
    console.log("🔍 Making GraphQL request with handle:", handle);
    const data = await graphQLClient.request(query, { handle });

    console.log("📦 GraphQL response:", data);

    if (!data.product) {
      console.log("❌ No product found for handle:", handle);
      return res.status(404).json({
        error: "Product not found",
        handle: handle,
        message: `No product found with handle "${handle}"`,
      });
    }

    console.log("✅ Returning product:", data.product.title);
    console.log("📊 Product structure:", {
      id: data.product.id,
      title: data.product.title,
      handle: data.product.handle,
      hasImages: !!data.product.images?.edges?.length,
      hasVariants: !!data.product.variants?.edges?.length,
    });

    // Return the single product object (NOT wrapped in array)
    res.json(data.product);
  } catch (error) {
    console.error("❌ Error fetching product:", error);
    console.error("❌ Error details:", error.response?.errors || error.message);
    res.status(500).json({
      error: "Failed to fetch product",
      message: error.message,
      handle: handle,
    });
  }
});

// CREATE CART ENDPOINT (UPDATED FROM checkoutCreate)
router.post("/checkout/create", async (req, res) => {
  try {
    console.log("🛒 Creating cart...");
    const { lineItems } = req.body;

    // Validation
    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({
        error: "Invalid lineItems: must be non-empty array",
      });
    }

    // Validate each line item
    for (const item of lineItems) {
      if (!item.variantId || !item.quantity) {
        return res.status(400).json({
          error: "Each lineItem must have variantId and quantity",
        });
      }

      if (!item.variantId.startsWith("gid://shopify/ProductVariant/")) {
        return res.status(400).json({
          error: `Invalid variantId format: ${item.variantId}. Must be GraphQL format.`,
        });
      }
    }

    console.log("📦 Line items to add:", lineItems);

    // UPDATED: Using cartCreate instead of checkoutCreate
    const mutation = `
      mutation cartCreate($input: CartInput!) {
        cartCreate(input: $input) {
          cart {
            id
            checkoutUrl
            totalQuantity
            cost {
              totalAmount {
                amount
                currencyCode
              }
              subtotalAmount {
                amount
                currencyCode
              }
              totalTaxAmount {
                amount
                currencyCode
              }
            }
            lines(first: 250) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
                      price {
                        amount
                        currencyCode
                      }
                      product {
                        id
                        title
                        handle
                      }
                    }
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        lines: lineItems.map((item) => ({
          merchandiseId: item.variantId,
          quantity: parseInt(item.quantity),
        })),
      },
    };

    console.log(
      "🚀 Sending cartCreate mutation with variables:",
      JSON.stringify(variables, null, 2)
    );

    const data = await graphQLClient.request(mutation, variables);

    console.log("📥 GraphQL response:", JSON.stringify(data, null, 2));

    if (data.cartCreate.userErrors.length > 0) {
      console.error("❌ Cart creation errors:", data.cartCreate.userErrors);
      return res.status(400).json({
        error: "Cart creation failed",
        userErrors: data.cartCreate.userErrors,
      });
    }

    const cart = data.cartCreate.cart;

    if (!cart || !cart.checkoutUrl) {
      console.error("❌ No cart or checkoutUrl in response");
      return res.status(500).json({
        error: "Cart creation failed - no checkoutUrl returned",
      });
    }

    console.log("✅ Cart created successfully!");
    console.log("🔗 Checkout URL:", cart.checkoutUrl);
    console.log(
      "💰 Total price:",
      cart.cost?.totalAmount?.amount,
      cart.cost?.totalAmount?.currencyCode
    );

    // Return the cart data in the same format as before for compatibility
    res.json({
      checkout: {
        id: cart.id,
        webUrl: cart.checkoutUrl, // Map checkoutUrl to webUrl for compatibility
        ready: true, // Cart is always ready
        totalQuantity: cart.totalQuantity,
        subtotalPriceV2: cart.cost?.subtotalAmount,
        totalTaxV2: cart.cost?.totalTaxAmount,
        totalPriceV2: cart.cost?.totalAmount,
        lineItems: cart.lines,
      },
      cart: cart, // Also include the raw cart data
      success: true,
    });
  } catch (error) {
    console.error("❌ Error creating cart:", error);

    if (error.response?.errors) {
      console.error("❌ GraphQL errors:", error.response.errors);
    }

    res.status(500).json({
      error: "Failed to create cart",
      message: error.message,
      details: error.response?.errors || error.stack,
    });
  }
});

// ADD ITEMS TO CART ENDPOINT (UPDATED)
router.post("/checkout/add-items", async (req, res) => {
  try {
    console.log("➕ Adding items to cart...");
    const { checkoutId, lineItems } = req.body;

    if (!checkoutId) {
      return res.status(400).json({ error: "cartId (checkoutId) is required" });
    }

    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({
        error: "Invalid lineItems: must be non-empty array",
      });
    }

    // UPDATED: Using cartLinesAdd instead of checkoutLineItemsAdd
    const mutation = `
      mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
          cart {
            id
            checkoutUrl
            totalQuantity
            cost {
              totalAmount {
                amount
                currencyCode
              }
              subtotalAmount {
                amount
                currencyCode
              }
            }
            lines(first: 250) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
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
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      cartId: checkoutId, // Using the cart ID
      lines: lineItems.map((item) => ({
        merchandiseId: item.variantId,
        quantity: parseInt(item.quantity),
      })),
    };

    console.log(
      "🚀 Adding items with variables:",
      JSON.stringify(variables, null, 2)
    );

    const data = await graphQLClient.request(mutation, variables);

    if (data.cartLinesAdd.userErrors.length > 0) {
      console.error("❌ Add items errors:", data.cartLinesAdd.userErrors);
      return res.status(400).json({
        error: "Failed to add items to cart",
        userErrors: data.cartLinesAdd.userErrors,
      });
    }

    console.log("✅ Items added to cart successfully");

    const cart = data.cartLinesAdd.cart;

    // Return in compatible format
    res.json({
      checkout: {
        id: cart.id,
        webUrl: cart.checkoutUrl,
        subtotalPriceV2: cart.cost?.subtotalAmount,
        totalPriceV2: cart.cost?.totalAmount,
        lineItems: cart.lines,
      },
      cart: cart,
      success: true,
    });
  } catch (error) {
    console.error("❌ Error adding items to cart:", error);
    res.status(500).json({
      error: "Failed to add items to cart",
      message: error.message,
    });
  }
});

// UPDATE CART LINES ENDPOINT (NEW)
router.post("/checkout/update-items", async (req, res) => {
  try {
    console.log("📝 Updating cart items...");
    const { cartId, lines } = req.body;

    if (!cartId) {
      return res.status(400).json({ error: "cartId is required" });
    }

    if (!lines || !Array.isArray(lines)) {
      return res.status(400).json({
        error: "Invalid lines: must be an array",
      });
    }

    const mutation = `
      mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
        cartLinesUpdate(cartId: $cartId, lines: $lines) {
          cart {
            id
            checkoutUrl
            totalQuantity
            cost {
              totalAmount {
                amount
                currencyCode
              }
              subtotalAmount {
                amount
                currencyCode
              }
            }
            lines(first: 250) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
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
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = { cartId, lines };

    const data = await graphQLClient.request(mutation, variables);

    if (data.cartLinesUpdate.userErrors.length > 0) {
      return res.status(400).json({
        error: "Failed to update cart items",
        userErrors: data.cartLinesUpdate.userErrors,
      });
    }

    const cart = data.cartLinesUpdate.cart;

    res.json({
      checkout: {
        id: cart.id,
        webUrl: cart.checkoutUrl,
        subtotalPriceV2: cart.cost?.subtotalAmount,
        totalPriceV2: cart.cost?.totalAmount,
        lineItems: cart.lines,
      },
      cart: cart,
      success: true,
    });
  } catch (error) {
    console.error("❌ Error updating cart:", error);
    res.status(500).json({
      error: "Failed to update cart",
      message: error.message,
    });
  }
});

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

// default export for ESM
export default router;
