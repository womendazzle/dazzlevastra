const express = require("express");
const app = express();
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const multer = require("multer");
const Razorpay = require("razorpay");

// ✅ Razorpay instance (use Render Environment Variables)
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ✅ Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(bodyParser.json({ limit: "10mb" }));

// ✅ Serve static files
app.use(express.static(path.join(__dirname, "Public")));
app.use("/images", express.static(path.join(__dirname, "images")));

// ✅ Multer setup for product images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "./images";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `product-${uniqueSuffix}${ext}`);
  }
});
const upload = multer({ storage: storage });

// ✅ Admin login
const ADMIN_CREDENTIALS = {
  username: "admin",
  password: "dazzle123"
};
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

// ✅ Save order
app.post("/api/order", (req, res) => {
  const order = req.body;

  const requiredFields = [
    "name",
    "mobile",
    "address",
    "city",
    "state",
    "pincode",
    "products",
    "total",
    "paymentId",
    "date"
  ];

  for (let field of requiredFields) {
    if (!order[field] && field !== "email") {
      return res
        .status(400)
        .json({ success: false, message: `Missing field: ${field}` });
    }
  }

  if (!Array.isArray(order.products) || order.products.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Products must be a non-empty array" });
  }

  for (let p of order.products) {
    if (!p.id || !p.name || !p.image || !p.size || !p.price) {
      return res.status(400).json({
        success: false,
        message: "Each product must have id, name, image, size, and price"
      });
    }
  }

  order.paymentStatus = order.paymentId ? "Paid" : "Pending";

  fs.readFile("orders.json", "utf8", (err, data) => {
    let orders = [];
    if (!err && data) {
      try {
        orders = JSON.parse(data);
      } catch {
        orders = [];
      }
    }
    orders.push(order);
    fs.writeFile("orders.json", JSON.stringify(orders, null, 2), () => {
      res.json({ success: true, message: "Order saved", order });
    });
  });
});

// ✅ Get all orders
app.get("/orders.json", (req, res) => {
  fs.readFile("orders.json", "utf8", (err, data) => {
    if (err) return res.json([]);
    res.json(JSON.parse(data));
  });
});

// ✅ Delete order
app.post("/delete-order", (req, res) => {
  const index = req.body.index;
  fs.readFile("orders.json", "utf8", (err, data) => {
    if (err) return res.status(500).send("Failed to read orders.");
    let orders = JSON.parse(data);
    if (index >= 0 && index < orders.length) {
      orders.splice(index, 1);
      fs.writeFile("orders.json", JSON.stringify(orders, null, 2), err => {
        if (err) return res.status(500).send("Delete failed");
        res.send("Order deleted");
      });
    } else {
      res.status(400).send("Invalid index");
    }
  });
});

// ✅ Update payment
app.post("/api/update-payment", (req, res) => {
  const { id, paymentId, paymentStatus } = req.body;

  if (!id || !paymentStatus) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required fields" });
  }

  fs.readFile("orders.json", "utf8", (err, data) => {
    if (err)
      return res
        .status(500)
        .json({ success: false, message: "Failed to read orders file" });

    let orders = [];
    try {
      orders = JSON.parse(data);
    } catch {
      return res
        .status(500)
        .json({ success: false, message: "Invalid orders file" });
    }

    const index = orders.findIndex(o => String(o.id) === String(id));
    if (index === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    orders[index].paymentId = paymentId || "-";
    orders[index].paymentStatus = paymentStatus;

    fs.writeFile("orders.json", JSON.stringify(orders, null, 2), err => {
      if (err)
        return res
          .status(500)
          .json({ success: false, message: "Failed to update order" });
      res.json({
        success: true,
        message: "Payment status updated",
        order: orders[index]
      });
    });
  });
});

// ✅ Products APIs
app.get("/products.json", (req, res) => {
  fs.readFile("products.json", "utf8", (err, data) => {
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
      image: imagePath
    };

    fs.readFile("products.json", "utf8", (err, data) => {
      let products = [];
      if (!err && data) {
        try {
          products = JSON.parse(data);
        } catch {
          products = [];
        }
      }

      products.push(newProduct);

      fs.writeFile("products.json", JSON.stringify(products, null, 2), () => {
        res.json({ success: true });
      });
    });
  } catch (err) {
    console.error("Error adding product:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.put("/api/update-product/:id", upload.single("image"), (req, res) => {
  const id = String(req.params.id);
  fs.readFile("products.json", "utf8", (err, data) => {
    let products = [];
    if (!err && data) {
      try {
        products = JSON.parse(data);
      } catch (e) {
        products = [];
      }
    }
    const idx = products.findIndex(p => String(p.id) === id);
    if (idx === -1)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });

    const existing = products[idx];
    if (req.body.name) existing.name = req.body.name;
    if (req.body.category) existing.category = req.body.category;
    if (req.body.price) existing.price = Number(req.body.price);
    if (req.body.sizes) {
      try {
        existing.sizes = JSON.parse(req.body.sizes);
      } catch (e) {
        existing.sizes = (req.body.sizes || "")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean);
      }
    }

    if (req.file) {
      const newPath = "/images/" + req.file.filename;
      if (existing.image && existing.image.startsWith("/images")) {
        const oldFile = path.join(__dirname, existing.image);
        fs.unlink(oldFile, () => {});
      }
      existing.image = newPath;
    }

    products[idx] = existing;
    fs.writeFile("products.json", JSON.stringify(products, null, 2), werr => {
      if (werr) return res.status(500).json({ success: false });
      res.json({ success: true, product: existing });
    });
  });
});

app.delete("/api/delete-product/:id", (req, res) => {
  const id = String(req.params.id);
  fs.readFile("products.json", "utf8", (err, data) => {
    let products = [];
    if (!err && data) {
      try {
        products = JSON.parse(data);
      } catch (e) {
        products = [];
      }
    }
    const idx = products.findIndex(p => String(p.id) === id);
    if (idx === -1)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });

    const [removed] = products.splice(idx, 1);
    if (removed && removed.image && removed.image.startsWith("/images")) {
      const filePath = path.join(__dirname, removed.image);
      fs.unlink(filePath, () => {});
    }

    fs.writeFile("products.json", JSON.stringify(products, null, 2), werr => {
      if (werr) return res.status(500).json({ success: false });
      res.json({ success: true });
    });
  });
});

// ✅ Razorpay order
app.post("/create-order", async (req, res) => {
  const { amount } = req.body;

  try {
    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "order_rcptid_" + Date.now()
    });

    res.json(order);
  } catch (err) {
    console.error("Razorpay order creation error:", err);
    res.status(500).json({ success: false, message: "Payment failed" });
  }
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
