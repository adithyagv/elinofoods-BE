import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGO_URI;
export const newclient = new MongoClient(uri);

export async function connectDB() {
  try {
    await newclient.connect();
    console.log("MongoDB connected ");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
}
