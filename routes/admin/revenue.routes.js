// routes/revenue.routes.js
import express from "express";
const router = express.Router();

// GET /api/revenue/total
// GET /revenue/total
router.get("/total", async (req, res) => {
  try {
    const response = await fetch(
      `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-01/orders.json?status=any&limit=250`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.ADMIN_API,
          "Content-Type": "application/json",
        },
      }
    );
    const data = await response.json();
    const orders = data.orders || [];

    const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.total_price), 0);

    res.json({
      success: true,
      totalRevenue,
      currency: "INR",
      orderCount: orders.length,
    });
  } catch (error) {
    console.error("❌ Error fetching revenue:", error);
    res.status(500).json({ error: "Failed to fetch revenue" });
  }
});
// GET /api/revenue?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&customer_id=XXX&product=XXX
router.get("/", async (req, res) => {
  const { startDate, endDate, customerId, productId } = req.query;

  try {
    // Shopify REST API supports filtering by created_at_min and created_at_max
    let url = `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-01/orders.json?status=any&limit=250`;

    if (startDate) url += `&created_at_min=${startDate}T00:00:00-00:00`;
    if (endDate) url += `&created_at_max=${endDate}T23:59:59-00:00`;
    if (customerId) url += `&customer_id=${customerId}`;

    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": process.env.ADMIN_API,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    const orders = data.orders || [];

    let filteredOrders = orders;

    // Filter by productId if provided
    if (productId) {
      filteredOrders = orders.filter((order) =>
        order.line_items.some((item) => item.product_id == productId)
      );
    }

    const totalRevenue = filteredOrders.reduce(
      (sum, order) => sum + parseFloat(order.total_price),
      0
    );

    res.json({
      success: true,
      totalRevenue,
      currency: "INR",
      orderCount: filteredOrders.length,
    });
  } catch (error) {
    console.error("❌ Error fetching revenue with filters:", error);
    res.status(500).json({ error: "Failed to fetch revenue" });
  }
});

export default router;
