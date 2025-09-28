// routes/shopify/mongodbconnection.js
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGO_URI;
export const newclient = new MongoClient(uri);

export async function connectDB() {
  try {
    await newclient.connect();
    console.log("MongoDB connected for Shopify routes");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
}

// Create indexes for reviews collection
export async function createReviewIndexes() {
  try {
    const db = newclient.db("elinofoods");
    const reviewsCollection = db.collection("reviews");

    // Create indexes for better performance
    await reviewsCollection.createIndex({ productId: 1, createdAt: -1 });
    await reviewsCollection.createIndex({ productId: 1 });
    await reviewsCollection.createIndex({ createdAt: -1 });

    console.log("✅ Review indexes created successfully");
  } catch (error) {
    console.error("Error creating review indexes:", error);
  }
}

// Get database instance
export function getDB() {
  return newclient.db("elinofoods");
}
