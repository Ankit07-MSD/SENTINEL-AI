require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

const authRoutes = require("./routes/authRoutes");
const incidentRoutes = require("./routes/incidentRoutes");
const resourceRoutes = require("./routes/resourceRoutes");
const optimizationRoutes = require("./routes/optimizationRoutes");
const routeRoutes = require("./routes/routeRoutes");
const simulationRoutes = require("./routes/simulationRoutes");
const predictionRoutes = require("./routes/predictionRoutes");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.set("io", io); // so route handlers can emit real-time events

app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 })); // basic abuse protection

app.use("/api/auth", authRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/optimization", optimizationRoutes);
app.use("/api/optimization", routeRoutes);
app.use("/api/simulation", simulationRoutes);
app.use("/api/prediction", predictionRoutes);

app.get("/health", (req, res) => res.json({ status: "ok" }));

io.on("connection", (socket) => {
  console.log("Dashboard client connected:", socket.id);
  socket.on("disconnect", () => console.log("Dashboard client disconnected:", socket.id));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Sentinel AI backend running on port ${PORT}`));
