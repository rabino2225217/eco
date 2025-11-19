require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const MongoStore = require("connect-mongo");
const cors = require('cors');
const path = require('path');
const fs = require('fs'); 
const session = require('express-session');
const http = require('http');
const compression = require("compression");
const { Server } = require('socket.io');
const sharedSession = require("express-socket.io-session");

const app = express();

//Load ENV variables
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT) || 4000;
const mongodb = process.env.MONGODB_URI;
const clientOrigin =
  process.env.CLIENT_ORIGIN || "http://localhost:5173";

if (!mongodb) {
  throw new Error("MONGODB_URI not set in environment variables");
}

//Middleware
const allowedOrigins = clientOrigin
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(compression());

//Session config
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: mongodb }),
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24, 
  },
});

app.use(sessionMiddleware);

//MongoDB connection
mongoose.connect(mongodb)
.then(() => console.log("Connected to MongoDB"))
.catch(err => console.error("MongoDB error:", err));

// Create HTTP server
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  },
  transports: ["websocket"],
});

io.use(sharedSession(sessionMiddleware, {
  autoSave: true,
}));

io.on("connection", (socket) => {
  const session = socket.handshake.session;
  const role = session?.role;
  const userId = session?.userId;

  if (!userId || !role) {
    console.log("Unknown or unauthenticated socket:", socket.id);
    return;
  }

  if (role === "Admin") {
    socket.join("admins");
    console.log(`Admin joined: ${socket.id}`);
  } else {
    socket.join(userId.toString());
    console.log(`Client joined with userId ${userId}: ${socket.id}`);
  }

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

//Make io accessible in routes/controllers
app.set('io', io);

//Admin routes
app.use('/admin/users', require('./routes/admin/userRoutes'));
app.use('/admin/projects', require('./routes/admin/manageProjectRoutes'));
app.use('/admin/wms', require('./routes/admin/wmsRoutes'));
app.use('/admin/landcover', require('./routes/admin/landcoverRoutes'));

//Client routes
app.use('/analysis', require('./routes/client/analysisRoutes'));
app.use('/layer', require('./routes/client/layerRoutes'));
app.use('/auth', require('./routes/client/authRoutes'));
app.use('/project', require('./routes/client/projectRoutes'));
app.use('/summary', require('./routes/client/summaryRoutes'));

// Frontend is served by its own container, no need to serve static files here

//Auto-clean old temp files
const tempPath = path.join(__dirname, "uploads/temp");

if (!fs.existsSync(tempPath)) {
  fs.mkdirSync(tempPath, { recursive: true });
}

const cleanTempFiles = () => {
  fs.readdir(tempPath, (err, files) => {
    if (err) return; 
    for (const file of files) {
      const filePath = path.join(tempPath, file);
      fs.stat(filePath, (err, stats) => {
        if (!err && Date.now() - stats.mtimeMs > 3 * 60 * 60 * 1000) {
          fs.unlink(filePath, (unlinkErr) => {
            if (!unlinkErr) {
              console.log(`Deleted old temp file: ${file}`);
            }
          });
        }
      });
    }
  });
};

//Run cleanup immediately once at startup and every 3 hours
cleanTempFiles();
setInterval(cleanTempFiles, 3 * 60 * 60 * 1000);
  
//Start server
server.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
});