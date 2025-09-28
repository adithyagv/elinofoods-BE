import express from "express";
import graphQLClient from "../../utils/shopifyClient.js";

const router = express.Router();

// GET CUSTOMER'S ACTIVE CART (OPTIMIZED)
router.post("/cart", async (req, res) => {
  try {
    const { customerAccessToken } = req.body;

    if (!customerAccessToken) {
      return res.status(400).json({
        error: "Customer access token is required",
      });
    }

    console.log("🛒 Fetching customer's cart...");

    // Optimized: Get customer and cart in one query if possible
    const query = `
      query getCustomerCart($customerAccessToken: String!) {
        customer(customerAccessToken: $customerAccessToken) {
          id
          email
          metafields(identifiers: [{namespace: "custom", key: "active_cart_id"}]) {
            id
            value
          }
        }
      }
    `;

    const customerData = await graphQLClient.request(query, {
      customerAccessToken,
    });

    if (!customerData.customer) {
      return res.status(401).json({
        error: "Invalid or expired customer token",
      });
    }

    const activeCartId = customerData.customer.metafields?.[0]?.value;

    if (!activeCartId) {
      return res.json({
        cart: null,
        message: "No active cart found",
      });
    }

    // Optimized cart query - only essential fields
    const cartQuery = `
      query getCart($id: ID!) {
        cart(id: $id) {
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
                      images(first: 1) {
                        edges {
                          node {
                            url(transform: {maxWidth: 200, maxHeight: 200})
                            altText
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const cartData = await graphQLClient.request(cartQuery, {
      id: activeCartId,
    });

    if (!cartData.cart) {
      return res.json({
        cart: null,
        message: "Cart not found or expired",
      });
    }

    res.json({
      cart: cartData.cart,
      success: true,
    });
  } catch (error) {
    console.error("❌ Error fetching customer cart:", error);
    res.status(500).json({
      error: "Failed to fetch customer cart",
      message: error.message,
    });
  }
});

router.post("/me", async (req, res) => {
  const { token } = req.body;

  const query = `
    query ($customerAccessToken: String!) {
      customer(customerAccessToken: $customerAccessToken) {
        id
        email
        firstName
        lastName
        phone
        defaultAddress {
          id
       
          address1
          address2
          city
          province
          country
          zip
        }
      
        orders(first: 10) {
          edges {
            node {
              id
              orderNumber
              totalPriceV2 {
                amount
                currencyCode
              }
              processedAt
            }
          }
        }
      }
    }
  `;

  try {
    const variables = { customerAccessToken: token };
    const data = await graphQLClient.request(query, variables);

    if (!data.customer) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    res.json({ success: true, customer: data.customer });
  } catch (error) {
    console.error("❌ Error fetching customer:", error);
    res.status(500).json({ error: "Failed to fetch customer details" });
  }
});

// LOGOUT (invalidate token)
router.post("/logout", async (req, res) => {
  const { token } = req.body;

  const mutation = `
    mutation customerAccessTokenDelete($customerAccessToken: String!) {
      customerAccessTokenDelete(customerAccessToken: $customerAccessToken) {
        deletedAccessToken
        deletedCustomerAccessTokenId
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const data = await graphQLClient.request(mutation, {
      customerAccessToken: token,
    });

    if (data.customerAccessTokenDelete.userErrors.length > 0) {
      return res
        .status(400)
        .json({ errors: data.customerAccessTokenDelete.userErrors });
    }

    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("❌ Error logging out customer:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

export default router;
