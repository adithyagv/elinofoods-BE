import express from "express";
import graphQLClient from "../../utils/shopifyClient.js";
import { saveCartToCustomerMetafield } from "../../utils/cartHelpers.js";

const router = express.Router();

// CREATE CART ENDPOINT (OPTIMIZED)
router.post("/create", async (req, res) => {
  try {
    console.log("🛒 Creating cart...");
    const { lineItems, customerAccessToken } = req.body;

    // Validation (keeping original validation logic)
    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({
        error: "Invalid lineItems: must be non-empty array",
      });
    }

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

    // Optimized mutation - only return essential fields
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
            }
            lines(first: 100) {
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
        ...(customerAccessToken && {
          buyerIdentity: {
            customerAccessToken: customerAccessToken,
          },
        }),
      },
    };

    const data = await graphQLClient.request(mutation, variables);

    if (data.cartCreate.userErrors.length > 0) {
      console.error("❌ Cart creation errors:", data.cartCreate.userErrors);
      return res.status(400).json({
        error: "Cart creation failed",
        userErrors: data.cartCreate.userErrors,
      });
    }

    const cart = data.cartCreate.cart;

    if (!cart || !cart.checkoutUrl) {
      return res.status(500).json({
        error: "Cart creation failed - no checkoutUrl returned",
      });
    }

    // Background task: Save cart ID to customer metafield (don't wait for it)
    if (customerAccessToken && cart.id) {
      saveCartToCustomerMetafield(customerAccessToken, cart.id).catch(
        (error) => {
          console.error("⚠️ Background: Failed to save cart ID:", error);
        }
      );
    }

    console.log("✅ Cart created successfully!");

    res.json({
      checkout: {
        id: cart.id,
        webUrl: cart.checkoutUrl,
        ready: true,
        totalQuantity: cart.totalQuantity,
        subtotalPriceV2: cart.cost?.subtotalAmount,
        totalPriceV2: cart.cost?.totalAmount,
        lineItems: cart.lines,
      },
      cart: cart,
      success: true,
    });
  } catch (error) {
    console.error("❌ Error creating cart:", error);
    res.status(500).json({
      error: "Failed to create cart",
      message: error.message,
    });
  }
});

// ADD ITEMS TO CART ENDPOINT (UPDATED)
router.post("/add-items", async (req, res) => {
  try {
    console.log("➕ Adding items to cart...");
    const { checkoutId, lineItems, customerAccessToken } = req.body;

    if (!checkoutId) {
      return res.status(400).json({ error: "cartId (checkoutId) is required" });
    }

    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({
        error: "Invalid lineItems: must be non-empty array",
      });
    }

    const mutation = `
      mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
          cart {
            id
            checkoutUrl
            totalQuantity
            buyerIdentity {
              email
              customer {
                id
              }
            }
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
      cartId: checkoutId,
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

    // If customer token provided and cart doesn't have buyer identity, associate it
    if (customerAccessToken && !cart.buyerIdentity?.customer) {
      try {
        const associateMutation = `
          mutation cartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
            cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
              cart {
                id
                buyerIdentity {
                  customer {
                    id
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

        await graphQLClient.request(associateMutation, {
          cartId: checkoutId,
          buyerIdentity: {
            customerAccessToken,
          },
        });

        console.log("🔗 Cart associated with customer");
      } catch (associateError) {
        console.error(
          "⚠️ Failed to associate cart with customer:",
          associateError
        );
      }
    }

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
router.post("/update-items", async (req, res) => {
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

// REMOVE CART LINES ENDPOINT (NEW)
router.post("/remove-items", async (req, res) => {
  try {
    console.log("🗑️ Removing cart items...");
    const { cartId, lineIds } = req.body;

    if (!cartId) {
      return res.status(400).json({ error: "cartId is required" });
    }

    if (!lineIds || !Array.isArray(lineIds) || lineIds.length === 0) {
      return res.status(400).json({
        error: "Invalid lineIds: must be non-empty array",
      });
    }

    const mutation = `
      mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
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

    const variables = { cartId, lineIds };

    const data = await graphQLClient.request(mutation, variables);

    if (data.cartLinesRemove.userErrors.length > 0) {
      return res.status(400).json({
        error: "Failed to remove cart items",
        userErrors: data.cartLinesRemove.userErrors,
      });
    }

    const cart = data.cartLinesRemove.cart;

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
    console.error("❌ Error removing cart items:", error);
    res.status(500).json({
      error: "Failed to remove cart items",
      message: error.message,
    });
  }
});

// MERGE ANONYMOUS CART WITH CUSTOMER CART (OPTIMIZED)
router.post("/merge-cart", async (req, res) => {
  try {
    const { anonymousCartId, customerAccessToken } = req.body;

    if (!anonymousCartId || !customerAccessToken) {
      return res.status(400).json({
        error: "Both anonymousCartId and customerAccessToken are required",
      });
    }

    console.log("🔄 Merging carts...");

    // Get both carts in parallel
    const [anonymousCartData, customerCartResponse] = await Promise.all([
      graphQLClient.request(
        `
        query getCart($id: ID!) {
          cart(id: $id) {
            id
            lines(first: 100) {
              edges {
                node {
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      `,
        { id: anonymousCartId }
      ),

      fetch(`${req.protocol}://${req.get("host")}/api/shopify/customer/cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerAccessToken }),
      }).then((r) => r.json()),
    ]);

    if (!anonymousCartData.cart) {
      return res.status(404).json({ error: "Anonymous cart not found" });
    }

    const lineItems = anonymousCartData.cart.lines.edges.map((edge) => ({
      merchandiseId: edge.node.merchandise.id,
      quantity: edge.node.quantity,
    }));

    let targetCartId;

    if (customerCartResponse.cart) {
      // Add to existing customer cart
      targetCartId = customerCartResponse.cart.id;

      const addItemsMutation = `
        mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
          cartLinesAdd(cartId: $cartId, lines: $lines) {
            cart { id }
            userErrors { field message }
          }
        }
      `;

      await graphQLClient.request(addItemsMutation, {
        cartId: targetCartId,
        lines: lineItems,
      });
    } else {
      // Associate anonymous cart with customer
      const associateMutation = `
        mutation cartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
          cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
            cart {
              id
              buyerIdentity {
                customer { id }
              }
            }
            userErrors { field message }
          }
        }
      `;

      const associateData = await graphQLClient.request(associateMutation, {
        cartId: anonymousCartId,
        buyerIdentity: { customerAccessToken },
      });

      targetCartId = anonymousCartId;

      // Background: Save cart ID
      if (
        associateData.cartBuyerIdentityUpdate.cart.buyerIdentity?.customer?.id
      ) {
        saveCartToCustomerMetafield(customerAccessToken, targetCartId).catch(
          console.error
        );
      }
    }

    res.json({
      success: true,
      cartId: targetCartId,
      message: "Cart merged successfully",
    });
  } catch (error) {
    console.error("❌ Error merging cart:", error);
    res.status(500).json({
      error: "Failed to merge cart",
      message: error.message,
    });
  }
});

export default router;
