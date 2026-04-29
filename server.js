import express from "express";
import mongoose from "mongoose";
import Together from "together-ai";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import axios from "axios";
import { tavily } from "@tavily/core";
import { fileURLToPath } from "url";
dotenv.config();
mongoose.set("bufferCommands", false);
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 30000,
})
.then(() => console.log("MongoDB Connected"))
.catch(err => console.error("MongoDB Error:", err));
const chatSchema = new mongoose.Schema({
  sessionId: String,
  title: String,
  userMessage: String,
  botReply: String,
  products: Array,
  createdAt: {
    type: Date,
    default: Date.now
  }
});
const Chat = mongoose.model("Chat", chatSchema);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});
const tavilyClient = tavily({
  apiKey: process.env.TAVILY_API_KEY,
});
app.get("/", (req, res) =>{
  res.sendFile(path.join(__dirname, "index.html"));
});
async function getFashionResearch(userMessage){
  try{
    const query = `${userMessage} latest fashion trends styling advice outfit ideas`;
    const result = await tavilyClient.search(query, {
      searchDepth: "advanced",
      maxResults: 5,
      includeAnswer: true,
      includeRawContent: false,
    });
    return{
      summary: result.answer || "",
      sources:
        result.results?.map((item) => ({
          title: item.title,
          url: item.url,
          content: item.content,
        })) || [],
    };
  }catch (error){
    console.error("Tavily error:", error.message);
    return{
      summary: "",
      sources: [],
      error: "Fashion research unavailable",
    };
  }
}
async function getShoppingProducts(userMessage){
  try{
    const query = `${userMessage} outfit clothing fashion`;
    const response = await axios.get("https://serpapi.com/search.json",{
      params: {
        engine: "google_shopping",
        q: query,
        api_key: process.env.SERPAPI_API_KEY,
        gl: "in",
        hl: "en",
      },
    });
    const products = response.data.shopping_results || [];
    return products.slice(0, 8).map((product) => ({
      title: product.title,
      price: product.price,
      source: product.source,
      rating: product.rating,
      reviews: product.reviews,
      link: product.product_link || product.link || product.serpapi_product_api,
      thumbnail: product.thumbnail || product.extracted_thumbnail,
    }));
  }catch(error){
    console.error("SerpApi error:", error.message);
    return [];
  }
}
app.post("/chat", async (req, res) =>{
  try{
    const { message: userMessage, sessionId } = req.body;
    if(!userMessage || userMessage.trim() === ""){
      return res.status(400).json({
        error: "Message is required",
      });
    }
    const[fashionResearch, shoppingProducts] = await Promise.all([
      getFashionResearch(userMessage),
      getShoppingProducts(userMessage),
    ]);
    console.log("Tavily Research:", fashionResearch);
    console.log("SerpApi Products:", shoppingProducts);
    const response = await together.chat.completions.create({
      model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      temperature: 0.7,
      max_tokens: 1200,
      messages:[
        {
          role: "system",
          content: `
You are HANA, a premium AI fashion stylist and personal shopping assistant.

Your job:
- Give high-quality, stylish, and practical fashion advice.
- Use provided live fashion research and shopping data when relevant.
- Never invent prices, product links, stores, or ratings.
- If product data is missing, clearly mention it.

STRICT OUTPUT RULES (VERY IMPORTANT):
- Always respond in clean, well-structured Markdown.
- NEVER write long paragraphs.
- ALWAYS use bullet points.
- ALWAYS use headings with emojis.
- ALWAYS bold important items like clothing pieces, colors, and key tips.
- Keep lines short and readable.
- Make the response visually appealing.

MANDATORY FORMAT:

# 👗 HANA Style Guide

## 🔥 Best Outfit
- **Main Outfit:** (clearly bold items)
- **Vibe:** (1 short line)

## 🎨 Color Palette
- **Primary Colors:** ...
- **Accent Colors:** ...
- Short explanation

## 👟 Footwear
- **Option 1:** ...
- **Option 2:** ...

## 🧢 Accessories
- List 3–5 items using bullet points

## 🛍️ Product Suggestions
- Show 3–5 items like:
  - **Product Name** – Price – Store  
  - Why it fits the outfit

## ✨ Styling Tips
- Bullet points only
- Short and practical

## 🚫 What to Avoid
- Bullet points only

STYLE REQUIREMENTS:
- Use emojis ONLY in headings (not everywhere)
- Use bold text for important fashion items
- Keep it clean, modern, and premium looking
- Avoid repetition
- Avoid long explanations
`,
        },
        {
          role: "user",
          content: `
User request:
${userMessage}

Live fashion research from Tavily:
${JSON.stringify(fashionResearch, null, 2)}

Live shopping products from SerpApi:
${JSON.stringify(shoppingProducts, null, 2)}

Now answer the user as HANA.
          `,
        },
      ],
    });
    const aiReply = response.choices[0].message.content;
    try{
      await Chat.create({
        sessionId,
        title: userMessage.slice(0, 40),
        userMessage,
        botReply: aiReply,
        products: shoppingProducts
      });
    }catch(err){
      console.error("MongoDB save failed:", err.message);
    }
    res.json({
      reply: aiReply,
      products: shoppingProducts,
      sources: fashionResearch.sources,
    });
  }catch(error){
    console.error("Together error:", error);
    res.status(500).json({
      error: "Failed to process request",
    });
  }
});
app.get("/sessions", async (req, res) => {
  try {
    const sessions = await Chat.aggregate([
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: "$sessionId",
          title: { $first: "$title" },
          createdAt: { $first: "$createdAt" }
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]);

    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});
app.get("/history/:sessionId", async (req, res) => {
  try {
    const chats = await Chat.find({
      sessionId: req.params.sessionId
    }).sort({ createdAt: 1 });

    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});