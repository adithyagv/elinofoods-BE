import graphQLClient from "./shopifyClient.js";

// Helper function to save cart ID in background
export async function saveCartToCustomerMetafield(customerAccessToken, cartId) {
  try {
    // Get customer ID first
    const customerQuery = `
      query getCustomer($customerAccessToken: String!) {
        customer(customerAccessToken: $customerAccessToken) {
          id
        }
      }
    `;

    const customerData = await graphQLClient.request(customerQuery, {
      customerAccessToken,
    });

    if (!customerData.customer) return;

    const saveCartMutation = `
      mutation customerUpdate($input: CustomerUpdateInput!) {
        customerUpdate(input: $input) {
          customer {
            id
          }
          customerUserErrors {
            field
            message
          }
        }
      }
    `;

    await graphQLClient.request(saveCartMutation, {
      input: {
        id: customerData.customer.id,
        metafields: [
          {
            namespace: "custom",
            key: "active_cart_id",
            value: cartId,
            type: "single_line_text_field",
          },
        ],
      },
    });

    console.log("💾 Background: Cart ID saved to metafield");
  } catch (error) {
    console.error("⚠️ Background: Error saving cart ID:", error);
  }
}
