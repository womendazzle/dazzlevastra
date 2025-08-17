const express = require("express");
const app = express();
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const multer = require("multer");
const Razorpay = require("razorpay");

// ✅ Paths for JSON data storage
const DATA_DIR = path.join(__dirname, "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

// ✅ Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(PRODUCTS_FILE, "[]");
}
if (!fs.existsSync(ORDERS_FILE)) {
  fs.writeFileSync(ORDERS_FILE, "[]");
}

// ✅ Check for Razorpay keys
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error("❌ Missing Razorpay environment variables!");
  process.exit(1);
}

// ✅ Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(bodyParser.json({ limit: "10mb" }));

// ✅ Serve static files
app.use(express.static(path.join(__dirname, "Public")));
app.use("/images", express.static(path.join(__dirname, "images")));

// ✅ Multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, "images");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `product-${uniqueSuffix}${ext}`);
  },
});
const upload = multer({ storage: storage });

// ✅ Admin login
const ADMIN_CREDENTIALS = { username: "admin", password: "dazzle123" };
app.post("/api/admin-login", (req, res) => {
  const { username, password } = req.body;
  if (
    username === ADMIN_CREDENTIALS.username &&
    password === ADMIN_CREDENTIALS.password
  ) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: "Invalid credentials" });
  }
});

// ✅ Orders API
app.post("/api/order", (req, res) => {
  const order = req.body;

  if (!order.name || !order.mobile || !order.products) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  order.paymentStatus = order.paymentId ? "Paid" : "Pending";

  fs.readFile(ORDERS_FILE, "utf8", (err, data) => {
    let orders = [];
    if (!err && data) {
      try {
        orders = JSON.parse(data);
      } catch {
        orders = [];
      }
    }
    orders.push(order);
    fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), () => {
      res.json({ success: true, message: "Order saved", order });
    });
  });
});

app.get("/api/orders", (req, res) => {
  fs.readFile(ORDERS_FILE, "utf8", (err, data) => {
    if (err) return res.json([]);
    res.json(JSON.parse(data));
  });
});

app.post("/api/delete-order", (req, res) => {
  const index = req.body.index;
  fs.readFile(ORDERS_FILE, "utf8", (err, data) => {
    if (err) return res.status(500).send("Failed to read orders.");
    let orders = JSON.parse(data);
    if (index >= 0 && index < orders.length) {
      orders.splice(index, 1);
      fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), (err) => {
        if (err) return res.status(500).send("Delete failed");
        res.send("Order deleted");
      });
    } else {
      res.status(400).send("Invalid index");
    }
  });
});

// ✅ Products API
app.get("/api/products", (req, res) => {
  fs.readFile(PRODUCTS_FILE, "utf8", (err, data) => {
    if (err) return res.json([]);
    res.json(JSON.parse(data));
  });
});

app.post("/api/add-product", upload.single("image"), (req, res) => {
  try {
    const { name, category, price } = req.body;
    const sizes = JSON.parse(req.body.sizes || "[]");

    if (!req.file || !name || !category || !price) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }

    const imagePath = "/images/" + req.file.filename;

    const newProduct = {
      id: Date.now(),
      name,
      category,
      price: Number(price),
      sizes,
      image: imagePath,
    };

    fs.readFile(PRODUCTS_FILE, "utf8", (err, data) => {
      let products = [];
      if (!err && data) {
        try {
          products = JSON.parse(data);
        } catch {
          products = [];
        }
      }

      products.push(newProduct);

      fs.writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2), () => {
        res.json({ success: true });
      });
    });
  } catch (err) {
    console.error("Error adding product:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Razorpay order
app.post("/api/create-order", async (req, res) => {
  const { amount } = req.body;
  try {
    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "order_rcptid_" + Date.now(),
    });
    res.json(order);
  } catch (err) {
    console.error("Razorpay order creation error:", err);
    res.status(500).json({ success: false, message: "Payment failed" });
  }
});

// ✅ Serve frontend (SPA fallback)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "Public", "index.html"));
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
