import dotenv from "dotenv";
dotenv.config();

import { GraphQLClient } from "graphql-request";

if (!process.env.ADMIN_API) {
  console.error("❌ Missing ADMIN_API in .env");
  process.exit(1);
}

console.log("Admin token: ", process.env.ADMIN_API);

const endpoint = `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-10/graphql.json`;

const graphQLClient = new GraphQLClient(endpoint, {
  headers: {
    "X-Shopify-Access-Token": process.env.ADMIN_API,
    "Content-Type": "application/json",
  },
});

export default graphQLClient;
