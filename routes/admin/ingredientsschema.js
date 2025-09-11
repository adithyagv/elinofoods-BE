import mongoose from "mongoose";

const IngredientSchema = new mongoose.Schema({
  ingredient_id: { type: String, required: true, unique: true },
  ingredient_name: { type: String, required: true },
  product_id: { type: String, required: true },
  ingredient_image: { type: String },


});

const Ingredients = mongoose.model("ingredients", IngredientSchema);

export default Ingredients;
