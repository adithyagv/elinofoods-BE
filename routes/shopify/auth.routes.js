import express from "express";
import graphQLClient from "../../utils/shopifyClient.js";

const router = express.Router();

router.post("/create-account", async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    console.log("🔵 Create account endpoint hit");
    console.log("📦 Request body:", { email, firstName, lastName });

    // Step 1: Create the customer account
    const createMutation = `
      mutation customerCreate($input: CustomerCreateInput!) {
        customerCreate(input: $input) {
          customer {
            id
            email
            firstName
            lastName
          }
          customerUserErrors {
            field
            message
            code
          }
        }
      }
    `;

    const createVariables = {
      input: {
        email,
        password,
        firstName: firstName || "",
        lastName: lastName || "",
        acceptsMarketing: false,
      },
    };

    console.log("🚀 Creating customer account...");
    const createData = await graphQLClient.request(
      createMutation,
      createVariables
    );

    // Check for user errors
    if (createData.customerCreate?.customerUserErrors?.length > 0) {
      const errors = createData.customerCreate.customerUserErrors;
      console.error("❌ Customer creation errors:", errors);

      // Handle specific error cases
      if (errors.some((e) => e.code === "TAKEN")) {
        return res.status(409).json({
          error: "An account with this email already exists",
        });
      }

      return res.status(400).json({
        error: errors[0].message,
        errors: errors,
      });
    }

    // Check if customer was created
    if (!createData.customerCreate?.customer) {
      console.error("❌ No customer returned in response");
      return res.status(500).json({
        error: "Account creation failed - no customer data returned",
      });
    }

    const customer = createData.customerCreate.customer;
    console.log("✅ Customer created successfully:", customer.email);

    // Step 2: Log in the newly created customer to get access token
    const loginMutation = `
      mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
        customerAccessTokenCreate(input: $input) {
          customerAccessToken {
            accessToken
            expiresAt
          }
          customerUserErrors {
            code
            field
            message
          }
        }
      }
    `;

    const loginVariables = {
      input: {
        email,
        password,
      },
    };

    console.log("🔐 Logging in new customer...");
    const loginData = await graphQLClient.request(
      loginMutation,
      loginVariables
    );

    // Check for login errors
    if (loginData.customerAccessTokenCreate?.customerUserErrors?.length > 0) {
      const errors = loginData.customerAccessTokenCreate.customerUserErrors;
      console.error("❌ Login after creation failed:", errors);

      // Account was created but login failed
      return res.status(201).json({
        success: true,
        customer,
        warning:
          "Account created successfully but automatic login failed. Please log in manually.",
      });
    }

    const { customerAccessToken } = loginData.customerAccessTokenCreate;

    // Return customer data and access token
    res.json({
      success: true,
      customer,
      accessToken: customerAccessToken?.accessToken,
      expiresAt: customerAccessToken?.expiresAt,
    });
  } catch (error) {
    console.error("❌ Error creating account:", error);

    // Check if it's a GraphQL client error with specific details
    if (error.response?.errors) {
      console.error("❌ GraphQL errors:", error.response.errors);
      return res.status(400).json({
        error: "Account creation failed",
        details: error.response.errors,
      });
    }

    res.status(500).json({
      error: "Failed to create account",
      message: error.message,
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    console.log("🔐 Login attempt for:", email);

    const mutation = `
      mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
        customerAccessTokenCreate(input: $input) {
          customerAccessToken {
            accessToken
            expiresAt
          }
          customerUserErrors {
            code
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        email,
        password,
      },
    };

    console.log("🚀 Sending login mutation...");

    // Use graphQLClient instead of fetch
    const data = await graphQLClient.request(mutation, variables);

    console.log("📥 Login response received");

    // Check for user errors
    if (data.customerAccessTokenCreate?.customerUserErrors?.length > 0) {
      const errors = data.customerAccessTokenCreate.customerUserErrors;
      console.error("❌ Login errors:", errors);

      // Handle specific error codes
      if (errors.some((e) => e.code === "UNIDENTIFIED_CUSTOMER")) {
        return res.status(401).json({
          error: "Invalid email or password",
        });
      }

      // Handle disabled customer accounts
      if (errors.some((e) => e.message?.includes("disabled"))) {
        return res.status(401).json({
          error: "This account is disabled. Please contact support.",
          code: "ACCOUNT_DISABLED",
        });
      }

      return res.status(401).json({
        error: errors[0].message || "Login failed",
        errors: errors,
      });
    }

    // Check if we got an access token
    if (!data.customerAccessTokenCreate?.customerAccessToken?.accessToken) {
      console.error("❌ No access token returned");
      return res.status(401).json({
        error: "Login failed - no access token returned",
      });
    }

    const { accessToken, expiresAt } =
      data.customerAccessTokenCreate.customerAccessToken;

    console.log("✅ Login successful for:", email);

    res.json({
      success: true,
      accessToken,
      expiresAt,
    });
  } catch (error) {
    console.error("❌ Login error:", error);

    // Check if it's a GraphQL client error
    if (error.response?.errors) {
      console.error("❌ GraphQL errors:", error.response.errors);

      // Check if it's a token issue
      if (
        error.response.errors.some((e) => e.extensions?.code === "UNAUTHORIZED")
      ) {
        return res.status(401).json({
          error: "Invalid Storefront Access Token",
          message: "Please check your SHOPIFY_STOREFRONT_ACCESS_TOKEN",
        });
      }

      return res.status(400).json({
        error: "Login failed",
        details: error.response.errors,
      });
    }

    res.status(500).json({
      error: "Login failed",
      message: error.message,
    });
  }
});

export default router;
