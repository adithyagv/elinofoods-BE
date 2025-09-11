// utils/shopifyAdminClient.js
import dotenv from "dotenv";
dotenv.config();

import { GraphQLClient } from "graphql-request";

if (!process.env.ADMIN_API) {
  console.error("❌ Missing ADMIN_API in .env");
  process.exit(1);
}

const endpoint = `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`;

const adminGraphQLClient = new GraphQLClient(endpoint, {
  headers: {
    "X-Shopify-Access-Token": process.env.ADMIN_API, // 🔑 Admin token
    "Content-Type": "application/json",
  },
});

export default adminGraphQLClient;
