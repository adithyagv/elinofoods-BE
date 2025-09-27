// routes/admin/customers.routes.js
import express from "express";
import adminGraphQLClient from "../../utils/shopifyAdminClient.js";
import fetch from "node-fetch";

const router = express.Router();

/**
 * 1. Get total count of customers
 *    Uses Admin REST API
 */
router.get("/count", async (req, res) => {
  try {
    const response = await fetch(
      `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-01/customers/count.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.ADMIN_API,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    res.json({ success: true, count: data.count });
  } catch (error) {
    console.error("❌ Error fetching customer count:", error);
    res.status(500).json({ error: "Failed to fetch customer count" });
  }
});

/**
 * 2. Fetch customer orders by ID
 */
router.get("/:id/orders", async (req, res) => {
  const { id } = req.params;

  try {
    const ordersResponse = await fetch(
      `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-01/orders.json?customer_id=${id}&status=any&limit=250`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.ADMIN_API,
          "Content-Type": "application/json",
        },
      }
    );

    const { orders } = await ordersResponse.json();

    const simplifiedOrders = orders.map(order => ({
      id: order.id,
      order_number: order.order_number,
      name: order.name,
      total_price: order.total_price,
      currency: order.currency,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      created_at: order.created_at,
      processed_at: order.processed_at,
      line_items: order.line_items.map(item => ({
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        total_discount: item.total_discount,
      })),
      customer_locale: order.customer_locale,
      billing_address: order.billing_address,
    }));

    res.json({
      success: true,
      customer_id: id,
      orders: simplifiedOrders,
    });
  } catch (error) {
    console.error(`❌ Error fetching orders for customer ${id}:`, error);
    res.status(500).json({ error: "Failed to fetch customer orders" });
  }
});

/**
 * 3. Customer product insights
 *    - Most purchased product
 */
// routes/admin/customers.routes.js

router.get("/:id/insights", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Fetch customer details
    const customerResponse = await fetch(
      `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-01/customers/${id}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.ADMIN_API,
          "Content-Type": "application/json",
        },
      }
    );
    const { customer } = await customerResponse.json();
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // 2. Fetch all orders for this customer
    const ordersResponse = await fetch(
      `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-01/orders.json?customer_id=${id}&status=any&limit=250`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.ADMIN_API,
          "Content-Type": "application/json",
        },
      }
    );
    const { orders } = await ordersResponse.json();

    // 3. Aggregate most purchased product
    const productCount = {};
    orders.forEach(order => {
      order.line_items.forEach(item => {
        const title = item.title;
        const qty = item.quantity;
        productCount[title] = (productCount[title] || 0) + qty;
      });
    });

    const mostPurchasedEntry = Object.entries(productCount).sort((a, b) => b[1] - a[1])[0] || null;

    res.json({
      success: true,
      customer: {
        id: customer.id,
        name: `${customer.first_name} ${customer.last_name}`,
      },
      insights: {
        mostPurchasedProduct: mostPurchasedEntry
          ? { title: mostPurchasedEntry[0], quantity: mostPurchasedEntry[1] }
          : null,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching customer insights:", error);
    res.status(500).json({ error: "Failed to fetch customer insights" });
  }
});


router.get("/customers", async (req, res) => {
  try {
    // 1. Get total count
    const countResponse = await fetch(
      `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-01/customers/count.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.ADMIN_API,
          "Content-Type": "application/json",
        },
      }
    );
    const countData = await countResponse.json();

    // 2. Get all customers (Shopify REST API default limit = 50, max = 250)
    const customersResponse = await fetch(
      `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-01/customers.json?limit=250`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.ADMIN_API,
          "Content-Type": "application/json",
        },
      }
    );
    const customersData = await customersResponse.json();

    res.json({
      success: true,
      count: countData.count,
      customers: customersData.customers, // array of customer objects
    });
  } catch (error) {
    console.error("❌ Error fetching customers:", error);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

// UPDATE CUSTOMER (REST Admin API)
router.put("/update", async (req, res) => {

  try {
    let { id, firstName, lastName, phone, defaultAddress } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Customer ID is required" });
    }

    // 🔑 Extract numeric ID from gid:// format
    if (id.includes("/")) {
      id = id.split("/").pop();
    }

    // 1️⃣ Update customer basic info
    const customerResponse = await fetch(
      `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-01/customers/${id}.json`,
      {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": process.env.ADMIN_API,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer: {
            id,
            first_name: firstName,
            last_name: lastName,
            phone,
          },
        }),
      }
    );

    const customerText = await customerResponse.text();
    let customerData;
    try {
      customerData = JSON.parse(customerText);
    } catch (e) {
      console.error("❌ Failed to parse Shopify customer response:", customerText);
      return res.status(500).json({ error: "Invalid response from Shopify" });
    }

    if (customerData.errors) {
      return res.status(400).json({ error: customerData.errors });
    }

    // Helper to extract numeric ID from gid://
    const extractNumericId = (gid) => {
      if (!gid) return null;
      let numeric = gid.split("/").pop();
      if (numeric.includes("?")) numeric = numeric.split("?")[0];
      return numeric;
    };

    // 2️⃣ Update default address if provided
    if (defaultAddress && defaultAddress.id) {
      const addressId = extractNumericId(defaultAddress.id);

      const addressResponse = await fetch(
        `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-01/customers/${id}/addresses/${addressId}.json`,
        {
          method: "PUT",
          headers: {
            "X-Shopify-Access-Token": process.env.ADMIN_API,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address: {
              address1: defaultAddress.address1,
              address2: defaultAddress.address2,
              city: defaultAddress.city,
              province: defaultAddress.province,
              zip: defaultAddress.zip,
              country: defaultAddress.country,
            },
          }),
        }
      );

      const addressText = await addressResponse.text();
      let addressData;
      try {
        addressData = JSON.parse(addressText);
      } catch (e) {
        console.error("❌ Shopify address API returned non-JSON:", addressText);
        return res
          .status(500)
          .json({ error: "Invalid response from Shopify Address API" });
      }

      if (addressData.errors) {
        return res.status(400).json({ error: addressData.errors });
      }

      // Optionally, make this address the default
      await fetch(
        `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-01/customers/${id}/addresses/${addressId}/default.json`,
        {
          method: "PUT",
          headers: {
            "X-Shopify-Access-Token": process.env.ADMIN_API,
            "Content-Type": "application/json",
          },
        }
      );

      return res.json({
        success: true,
        customer: customerData.customer,
        address: addressData.customer_address,
      });
    }

    // ✅ If no address update, just return updated customer
    res.json({ success: true, customer: customerData.customer });
  } catch (error) {
    console.error("❌ Error updating customer:", error);
    res.status(500).json({ error: "Failed to update customer" });
  }
});
export default router;
