const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/reloop_db";
const JWT_SECRET = process.env.JWT_SECRET || "development_only_change_me";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true }
}, { timestamps: true });

const listingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  itemName: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  wantedItem: { type: String, required: true, trim: true },
  status: { type: String, enum: ["ACTIVE", "REMOVED", "SWAPPED"], default: "ACTIVE" }
}, { timestamps: true });

const requestSchema = new mongoose.Schema({
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  toUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  offeredListing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
  targetListing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
  status: { type: String, enum: ["PENDING", "ACCEPTED", "REJECTED"], default: "PENDING" }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
const Listing = mongoose.model("Listing", listingSchema);
const SwapRequest = mongoose.model("SwapRequest", requestSchema);

const publicUser = user => ({ _id: user._id, name: user.name, email: user.email });
const makeToken = user => jwt.sign({ id: user._id.toString() }, JWT_SECRET, { expiresIn: "7d" });

async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Please sign in to continue." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(payload.id).select("-passwordHash");
    if (!req.user) return res.status(401).json({ message: "Account not found." });
    next();
  } catch {
    return res.status(401).json({ message: "Your session expired. Please sign in again." });
  }
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!name || !email || !password) return res.status(400).json({ message: "Please fill in every field." });
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters." });
    if (await User.findOne({ email })) return res.status(409).json({ message: "An account with this email already exists." });
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10) });
    res.status(201).json({ token: makeToken(user), user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "An account with this email already exists." });
    res.status(500).json({ message: "Could not create your account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(String(req.body.password || ""), user.passwordHash)))
      return res.status(401).json({ message: "Email or password is incorrect." });
    res.json({ token: makeToken(user), user: publicUser(user) });
  } catch { res.status(500).json({ message: "Could not sign you in." }); }
});
app.get("/api/auth/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get("/api/listings", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const filter = { status: "ACTIVE" };
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(safe, "i");
      filter.$or = [{ itemName: regex }, { category: regex }, { wantedItem: regex }];
    }
    const listings = await Listing.find(filter).populate("user", "name email").sort({ createdAt: -1 });
    res.json({ listings });
  } catch { res.status(500).json({ message: "Could not load listings." }); }
});

app.post("/api/listings", auth, async (req, res) => {
  try {
    const itemName = String(req.body.itemName || "").trim();
    const category = String(req.body.category || "").trim();
    const wantedItem = String(req.body.wantedItem || "").trim();
    if (!itemName || !category || !wantedItem) return res.status(400).json({ message: "Item name, category and wanted item are required." });
    const listing = await Listing.create({ user: req.user._id, itemName, category, wantedItem });
    await listing.populate("user", "name email");
    res.status(201).json({ listing, message: "Your listing is live!" });
  } catch { res.status(500).json({ message: "Could not create the listing." }); }
});

app.delete("/api/listings/:id", auth, async (req, res) => {
  try {
    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id, status: "ACTIVE" },
      { status: "REMOVED" }, { new: true }
    );
    if (!listing) return res.status(404).json({ message: "Active listing not found, or it does not belong to you." });
    res.json({ message: "Listing removed from the marketplace." });
  } catch { res.status(400).json({ message: "Invalid listing ID." }); }
});

// Exact two-way matching: each student wants the item the other student has.
app.get("/api/listings/:id/matches", auth, async (req, res) => {
  try {
    const selected = await Listing.findOne({ _id: req.params.id, status: "ACTIVE" });
    if (!selected) return res.status(404).json({ message: "Listing not found." });
    if (selected.user.toString() !== req.user._id.toString()) return res.status(403).json({ message: "You can only find matches for your own listing." });
    const active = await Listing.find({ status: "ACTIVE" }).populate("user", "name email");
    const norm = value => String(value || "").toLowerCase().trim();
    const matches = active.filter(other =>
      !other._id.equals(selected._id) &&
      other.user._id.toString() !== req.user._id.toString() &&
      norm(selected.wantedItem) === norm(other.itemName) &&
      norm(other.wantedItem) === norm(selected.itemName)
    );
    res.json({ matches });
  } catch { res.status(400).json({ message: "Could not find matches. Check the listing ID." }); }
});

app.post("/api/requests", auth, async (req, res) => {
  try {
    const { offeredListingId, targetListingId } = req.body;
    if (!offeredListingId || !targetListingId || offeredListingId === targetListingId) return res.status(400).json({ message: "Choose two different listings." });
    const [offered, target] = await Promise.all([
      Listing.findOne({ _id: offeredListingId, status: "ACTIVE" }),
      Listing.findOne({ _id: targetListingId, status: "ACTIVE" })
    ]);
    if (!offered || !target) return res.status(404).json({ message: "One of these listings is no longer active." });
    if (offered.user.toString() !== req.user._id.toString()) return res.status(403).json({ message: "You can only offer your own listing." });
    if (target.user.toString() === req.user._id.toString()) return res.status(400).json({ message: "You cannot request your own listing." });
    const duplicate = await SwapRequest.findOne({ fromUser: req.user._id, offeredListing: offered._id, targetListing: target._id, status: "PENDING" });
    if (duplicate) return res.status(409).json({ message: "You already sent this request." });
    const request = await SwapRequest.create({ fromUser: req.user._id, toUser: target.user, offeredListing: offered._id, targetListing: target._id });
    res.status(201).json({ request, message: "Swap request sent." });
  } catch { res.status(400).json({ message: "Could not send the request." }); }
});

app.get("/api/requests", auth, async (req, res) => {
  try {
    const requests = await SwapRequest.find({ $or: [{ fromUser: req.user._id }, { toUser: req.user._id }] })
      .populate("fromUser", "name email").populate("toUser", "name email")
      .populate("offeredListing", "itemName category wantedItem status")
      .populate("targetListing", "itemName category wantedItem status").sort({ createdAt: -1 });
    res.json({ requests });
  } catch { res.status(500).json({ message: "Could not load swap requests." }); }
});

app.patch("/api/requests/:id", auth, async (req, res) => {
  try {
    const status = String(req.body.status || "").toUpperCase();
    if (!["ACCEPTED", "REJECTED"].includes(status)) return res.status(400).json({ message: "Status must be ACCEPTED or REJECTED." });
    const request = await SwapRequest.findOne({ _id: req.params.id, toUser: req.user._id, status: "PENDING" });
    if (!request) return res.status(404).json({ message: "Pending request not found." });
    if (status === "ACCEPTED") {
      const [offered, target] = await Promise.all([
        Listing.findOne({ _id: request.offeredListing, status: "ACTIVE" }),
        Listing.findOne({ _id: request.targetListing, status: "ACTIVE" })
      ]);
      if (!offered || !target) return res.status(409).json({ message: "One of the listings is no longer active." });
      offered.status = "SWAPPED"; target.status = "SWAPPED";
      await Promise.all([offered.save(), target.save()]);
    }
    request.status = status;
    await request.save();
    res.json({ message: status === "ACCEPTED" ? "Swap accepted. Both listings are now marked as swapped." : "Swap request rejected.", request });
  } catch { res.status(400).json({ message: "Could not update the request." }); }
});

app.get("/api/health", (req, res) => res.json({ ok: true, app: "ReLoop API" }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

mongoose.connect(MONGODB_URI).then(() => {
  console.log("Connected to MongoDB");
  app.listen(PORT, () => console.log(`ReLoop is running at http://localhost:${PORT}`));
}).catch(error => {
  console.error("MongoDB connection failed:", error.message);
  console.error("Check that MongoDB is running and MONGODB_URI in .env is correct.");
  process.exit(1);
});
