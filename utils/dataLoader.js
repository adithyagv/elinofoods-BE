// utils/dataLoader.js
import DataLoader from "dataloader";

export function createProductLoader(graphQLClient) {
  return new DataLoader(async (handles) => {
    const query = `
      query($handles: [String!]!) {
        nodes(ids: $handles) {
          ... on Product {
            id
            handle
            title
            priceRange {
              minVariantPrice {
                amount
              }
            }
            featuredImage {
              url(transform: {maxWidth: 150, maxHeight: 150, preferredContentType: WEBP})
            }
            availableForSale
          }
        }
      }
    `;

    const data = await graphQLClient.request(query, { handles });
    return handles.map((handle) =>
      data.nodes.find((node) => node.handle === handle)
    );
  });
}
