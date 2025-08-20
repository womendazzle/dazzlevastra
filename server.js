// server.js
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import bodyParser from "body-parser";
import cors from "cors";
import Razorpay from "razorpay";

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Paths
const DATA_DIR = path.join(process.cwd(), "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

// ✅ Ensure folders/files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PRODUCTS_FILE)) fs.writeFileSync(PRODUCTS_FILE, "[]");
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");

// ✅ CORS (allow frontend domain + local dev)
app.use(
  cors({
    origin: ["https://dazzlevastra.com", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// ✅ Middleware
app.use(express.json({ limit: "10mb" }));
app.use(bodyParser.json({ limit: "10mb" }));
app.use("/uploads", express.static("uploads"));

// ✅ Multer setup for product images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "product-" + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// ✅ Razorpay setup (safe check)
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn("⚠️ Razorpay keys missing. Payments will not work.");
}
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "dummy",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "dummy",
});

/* ========== PRODUCTS API ========== */

// Get all products
app.get("/api/products", (req, res) => {
  try {
    const data = fs.readFileSync(PRODUCTS_FILE, "utf8");
    res.json(JSON.parse(data || "[]"));
  } catch (err) {
    console.error("❌ Products read error:", err);
    res.json([]);
  }
});

// Add product
app.post("/api/add-product", upload.single("image"), (req, res) => {
  try {
    const { name, category, price } = req.body;
    const sizes = JSON.parse(req.body.sizes || "[]");
    if (!name || !category || !price) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }
    const newProduct = {
      id: Date.now().toString(),
      name,
      category,
      price: Number(price),
      sizes,
      image: req.file ? "/uploads/" + req.file.filename : "",
    };
    const products = JSON.parse(
      fs.readFileSync(PRODUCTS_FILE, "utf8") || "[]"
    );
    products.push(newProduct);
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
    res.json({ success: true, product: newProduct });
  } catch (err) {
    console.error("❌ Add product error:", err);
    res.status(500).json({ success: false });
  }
});

// Update product
app.post("/api/update-product", upload.single("image"), (req, res) => {
  try {
    const { id, name, category, price, sizes } = req.body;
    if (!id)
      return res.status(400).json({ success: false, message: "Missing ID" });

    let products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8") || "[]");
    const index = products.findIndex((p) => String(p.id) === String(id));
    if (index === -1)
      return res.status(404).json({ success: false, message: "Product not found" });

    products[index].name = name || products[index].name;
    products[index].category = category || products[index].category;
    products[index].price = price ? Number(price) : products[index].price;
    products[index].sizes = sizes ? JSON.parse(sizes) : products[index].sizes;
    if (req.file) {
      products[index].image = "/uploads/" + req.file.filename;
    }

    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
    res.json({ success: true, product: products[index] });
  } catch (err) {
    console.error("❌ Update product error:", err);
    res.status(500).json({ success: false });
  }
});

// Delete product
app.post("/api/delete-product", (req, res) => {
  try {
    const { id } = req.body;
    if (!id)
      return res.status(400).json({ success: false, message: "Missing ID" });

    let products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8") || "[]");
    const newProducts = products.filter((p) => String(p.id) !== String(id));

    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(newProducts, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Delete product error:", err);
    res.status(500).json({ success: false });
  }
});

/* ========== ORDERS API ========== */

// Get all orders
app.get("/api/orders", (req, res) => {
  try {
    const data = fs.readFileSync(ORDERS_FILE, "utf8");
    res.json(JSON.parse(data || "[]"));
  } catch (err) {
    console.error("❌ Orders read error:", err);
    res.json([]);
  }
});

// Save order
app.post("/api/order", (req, res) => {
  try {
    const order = req.body;
    order.id = Date.now().toString();
    order.date = new Date().toISOString();
    const orders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8") || "[]");
    orders.push(order);
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
    res.json({ success: true, order });
  } catch (err) {
    console.error("❌ Order save error:", err);
    res.status(500).json({ success: false });
  }
});

/* ========== PAYMENTS API ========== */
app.post("/api/create-order", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount)
      return res
        .status(400)
        .json({ success: false, message: "Amount missing" });
    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "rcpt_" + Date.now(),
    });
    res.json(order);
  } catch (err) {
    console.error("❌ Razorpay error:", err);
    res.status(500).json({ success: false, message: "Payment failed" });
  }
});

/* ========== START SERVER ========== */
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
