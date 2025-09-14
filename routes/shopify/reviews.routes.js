// routes/shopify/reviews.routes.js
import express from "express";

const router = express.Router();

// Define Review Schema
const reviewSchema = {
  productId: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, default: "" },
  location: { type: String, default: "" },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  helpful: { type: Number, default: 0 },
  createdAt: { type: Date, default: new Date() },
};

// Helper function to format date
function formatDate(date) {
  const now = new Date();
  const reviewDate = new Date(date);
  const diffTime = Math.abs(now - reviewDate);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffTime / (1000 * 60));
      if (diffMinutes === 0) return "Just now";
      return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
    }
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30)
    return `${Math.floor(diffDays / 7)} week${
      Math.floor(diffDays / 7) > 1 ? "s" : ""
    } ago`;
  if (diffDays < 365)
    return `${Math.floor(diffDays / 30)} month${
      Math.floor(diffDays / 30) > 1 ? "s" : ""
    } ago`;
  return `${Math.floor(diffDays / 365)} year${
    Math.floor(diffDays / 365) > 1 ? "s" : ""
  } ago`;
}

// Test endpoint
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Reviews API is working",
    timestamp: new Date().toISOString(),
  });
});

// Get reviews for a specific product
router.get("/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, sort = "-createdAt" } = req.query;

    // Get db from request
    const db = req.db;
    const reviewsCollection = db.collection("reviews");

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Determine sort order
    let sortOrder = {};
    if (sort.startsWith("-")) {
      sortOrder[sort.substring(1)] = -1;
    } else {
      sortOrder[sort] = 1;
    }

    // Get reviews with pagination
    const reviews = await reviewsCollection
      .find({ productId })
      .sort(sortOrder)
      .limit(parseInt(limit))
      .skip(skip)
      .toArray();

    // Get total count for pagination
    const totalCount = await reviewsCollection.countDocuments({ productId });

    // Calculate stats using aggregation
    const statsResult = await reviewsCollection
      .aggregate([
        { $match: { productId } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
            rating1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
            rating2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
            rating3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
            rating4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
            rating5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
          },
        },
      ])
      .toArray();

    // Format stats
    const stats =
      statsResult.length > 0
        ? {
            averageRating: Math.round(statsResult[0].averageRating * 10) / 10,
            totalReviews: totalCount,
            ratingDistribution: {
              1: statsResult[0].rating1,
              2: statsResult[0].rating2,
              3: statsResult[0].rating3,
              4: statsResult[0].rating4,
              5: statsResult[0].rating5,
            },
          }
        : {
            averageRating: 0,
            totalReviews: 0,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          };

    // Add formatted date to reviews
    const formattedReviews = reviews.map((review) => ({
      ...review,
      formattedDate: formatDate(review.createdAt),
    }));

    res.json({
      success: true,
      data: {
        reviews: formattedReviews,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalReviews: totalCount,
          hasMore: skip + reviews.length < totalCount,
        },
        stats,
      },
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch reviews",
    });
  }
});

// Create a new review
router.post("/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, email, location, rating, comment } = req.body;

    // Validate required fields
    if (!name || !rating || !comment) {
      return res.status(400).json({
        success: false,
        error: "Name, rating, and comment are required",
      });
    }

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: "Rating must be between 1 and 5",
      });
    }

    // Get db from request
    const db = req.db;
    const reviewsCollection = db.collection("reviews");

    // Create new review document
    const newReview = {
      productId,
      name: name.trim(),
      email: email?.trim() || "",
      location: location?.trim() || "",
      rating: parseInt(rating),
      comment: comment.trim(),
      isVerified: false,
      helpful: 0,
      createdAt: new Date(),
    };

    // Insert the review
    const result = await reviewsCollection.insertOne(newReview);

    // Return the saved review with formatted date
    res.status(201).json({
      success: true,
      data: {
        ...newReview,
        _id: result.insertedId,
        formattedDate: "Just now",
      },
    });

    // Update product average rating in cache if available
    if (req.cache) {
      req.cache.del(`product_${productId}_reviews`);
    }
  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create review",
    });
  }
});

// Mark review as helpful
router.post("/:productId/:reviewId/helpful", async (req, res) => {
  try {
    const { reviewId } = req.params;

    // Get db from request
    const db = req.db;
    const reviewsCollection = db.collection("reviews");

    // MongoDB requires ObjectId for _id queries
    const { ObjectId } = await import("mongodb");

    const result = await reviewsCollection.findOneAndUpdate(
      { _id: new ObjectId(reviewId) },
      { $inc: { helpful: 1 } },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        error: "Review not found",
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error updating review:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update review",
    });
  }
});

// Delete a review (you might want to add authentication for this)
router.delete("/:productId/:reviewId", async (req, res) => {
  try {
    const { productId, reviewId } = req.params;

    // Get db from request
    const db = req.db;
    const reviewsCollection = db.collection("reviews");

    // MongoDB requires ObjectId for _id queries
    const { ObjectId } = await import("mongodb");

    const result = await reviewsCollection.deleteOne({
      _id: new ObjectId(reviewId),
      productId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Review not found",
      });
    }

    res.json({
      success: true,
      message: "Review deleted successfully",
    });

    // Clear cache if available
    if (req.cache) {
      req.cache.del(`product_${productId}_reviews`);
    }
  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete review",
    });
  }
});

// Get product average rating (useful for product listings)
router.get("/:productId/rating", async (req, res) => {
  try {
    const { productId } = req.params;

    // Check cache first
    const cacheKey = `product_${productId}_rating`;
    if (req.cache) {
      const cached = req.cache.get(cacheKey);
      if (cached) {
        return res.json({ success: true, data: cached });
      }
    }

    // Get db from request
    const db = req.db;
    const reviewsCollection = db.collection("reviews");

    // Calculate average rating
    const result = await reviewsCollection
      .aggregate([
        { $match: { productId } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const data =
      result.length > 0
        ? {
            averageRating: Math.round(result[0].averageRating * 10) / 10,
            totalReviews: result[0].totalReviews,
          }
        : {
            averageRating: 0,
            totalReviews: 0,
          };

    // Cache the result for 5 minutes
    if (req.cache) {
      req.cache.set(cacheKey, data, 300);
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error fetching product rating:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch product rating",
    });
  }
});

export default router;
