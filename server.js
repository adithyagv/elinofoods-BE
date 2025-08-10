import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import shopifyRoutes from "./routes/shopify.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/shopify", shopifyRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Elino Foods Backend API" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
