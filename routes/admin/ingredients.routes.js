import express from "express";
import Ingredients from "./ingredientsschema.js";

const router = express.Router();

router.post("/addingredient", async (req, res) => {
  const db = req.db; // Access the database instance from the request
  const ingredientData = req.body;
  console.log("sent ingredients:", ingredientData);
  try {
    const collection = db.collection("ingredients");
    const result = await new Ingredients(ingredientData);
    await collection.insertOne(result);

    return res.json({
      success: true,
      message: "Ingredient added successfully",
      ingredient: result,
    });
  } catch (error) {
    console.error("❌ Error adding ingredient:", error);
    return res.status(500).json({ error: "Failed to add ingredient" });
  }
});
router.get("/getingredients", async (req, res) => {
  const db = req.db;
  try {
    const collection = db.collection("ingredients");
    const ingredients = await collection.find({}).toArray();
    return res.json({ success: true, ingredients });
  } catch (error) {
    console.error("❌ Error fetching ingredients:", error);
    return res.status(500).json({ error: "Failed to fetch ingredients" });
  }
});
router.put("/updateingredient/:id", async (req, res) => {
  const db = req.db;
  const { id } = req.params;
  const updateData = req.body;
  console.log("update data:", updateData);
  try {
    const collection = db.collection("ingredients");
    const result = await collection.updateOne(
      { ingredient_id: id },
      { $set: updateData }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Ingredient not found" });
    }
    return res.json({
      success: true,
      message: "Ingredient updated successfully",
    });
  } catch (error) {
    console.error("❌ Error updating ingredient:", error);
    return res.status(500).json({ error: "Failed to update ingredient" });
  }
});
router.delete("/deleteingredient/:id", async (req, res) => {
  const db = req.db;
  const { id } = req.params;
  try {
    const collection = db.collection("ingredients");
    const result = await collection.deleteOne({ ingredient_id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Ingredient not found" });
    }
  } catch (error) {
    console.error("❌ Error deleting ingredient:", error);
    return res.status(500).json({ error: "Failed to delete ingredient" });
  }
});

export default router;
