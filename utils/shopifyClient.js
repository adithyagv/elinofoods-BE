import dotenv from "dotenv";
dotenv.config();

import { GraphQLClient } from "graphql-request";

if (!process.env.SHOPIFY_STOREFRONT_TOKEN) {
  console.error("❌ Missing SHOPIFY_STOREFRONT_TOKEN in .env");
  process.exit(1);
}

console.log("Storefront token: ", process.env.SHOPIFY_STOREFRONT_TOKEN);

const endpoint = `https://${process.env.SHOPIFY_DOMAIN}/api/2024-01/graphql.json`;

const graphQLClient = new GraphQLClient(endpoint, {
  headers: {
    "X-Shopify-Storefront-Access-Token": process.env.SHOPIFY_STOREFRONT_TOKEN,
    "Content-Type": "application/json",
  },
});

export default graphQLClient;
