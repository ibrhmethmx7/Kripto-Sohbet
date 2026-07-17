import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

interface EncryptedMessage {
  id: string;
  sender: string;
  ciphertext: string;
  iv: string;
  timestamp: number;
}

interface RoomData {
  messages: EncryptedMessage[];
}

const DB_FILE = path.join(process.cwd(), "kripto_sohbet_db.json");

// Load existing database on startup
let roomsDb: Record<string, RoomData> = {};
if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    roomsDb = JSON.parse(raw);
    console.log("Database loaded successfully with", Object.keys(roomsDb).length, "rooms.");
  } catch (err) {
    console.error("Failed to load existing database, starting fresh:", err);
    roomsDb = {};
  }
}

// Save database helper
function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(roomsDb, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save database:", err);
  }
}

// Manage SSE connections
type SSESubscriber = (data: string) => void;
const subscribers: Record<string, Set<SSESubscriber>> = {};

function broadcastToRoom(roomId: string, payload: any) {
  const roomSubs = subscribers[roomId];
  if (roomSubs && roomSubs.size > 0) {
    const dataStr = `data: ${JSON.stringify(payload)}\n\n`;
    roomSubs.forEach((send) => {
      try {
        send(dataStr);
      } catch (err) {
        console.error("Failed to push event to subscriber:", err);
      }
    });
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // API Route: Get room status/active users or simple test
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", activeRooms: Object.keys(roomsDb).length });
  });

  // API Route: SSE stream for real-time messages in a room
  app.get("/api/rooms/:roomId/stream", (req, res) => {
    const { roomId } = req.params;
    
    // Set headers for Server-Sent Events
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Prevent proxy buffering
    res.flushHeaders();

    // Initialize room if it doesn't exist
    if (!roomsDb[roomId]) {
      roomsDb[roomId] = { messages: [] };
      saveDb();
    }

    // Initialize subscriber list if needed
    if (!subscribers[roomId]) {
      subscribers[roomId] = new Set();
    }

    // Helper to send events directly to this client
    const sendEvent = (data: string) => {
      res.write(data);
    };

    // Add client to subscribers
    subscribers[roomId].add(sendEvent);
    console.log(`[SSE] Client connected to room: ${roomId}. Total subs: ${subscribers[roomId].size}`);

    // Send initial history
    const historyPayload = {
      type: "init",
      messages: roomsDb[roomId].messages,
    };
    sendEvent(`data: ${JSON.stringify(historyPayload)}\n\n`);

    // Keep connection alive with periodic heartbeats
    const heartbeatInterval = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 15000);

    // Cleanup when connection closes
    req.on("close", () => {
      clearInterval(heartbeatInterval);
      if (subscribers[roomId]) {
        subscribers[roomId].delete(sendEvent);
        console.log(`[SSE] Client disconnected from room: ${roomId}. Remaining: ${subscribers[roomId].size}`);
        if (subscribers[roomId].size === 0) {
          delete subscribers[roomId];
        }
      }
    });
  });

  // API Route: Send an encrypted message to a room
  app.post("/api/rooms/:roomId/messages", (req, res) => {
    const { roomId } = req.params;
    const { sender, ciphertext, iv } = req.body;

    if (!sender || !ciphertext || !iv) {
      res.status(400).json({ error: "Eksik parametreler (sender, ciphertext, iv gerekli)" });
      return;
    }

    if (!roomsDb[roomId]) {
      roomsDb[roomId] = { messages: [] };
    }

    const newMessage: EncryptedMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sender,
      ciphertext,
      iv,
      timestamp: Date.now(),
    };

    roomsDb[roomId].messages.push(newMessage);
    
    // Keep only last 100 messages for resource hygiene in memory
    if (roomsDb[roomId].messages.length > 100) {
      roomsDb[roomId].messages.shift();
    }

    saveDb();

    // Broadcast new message to all subscribers
    broadcastToRoom(roomId, {
      type: "message",
      message: newMessage,
    });

    res.status(201).json(newMessage);
  });

  // API Route: Self-Destruct / Clear messages in a room
  app.post("/api/rooms/:roomId/clear", (req, res) => {
    const { roomId } = req.params;

    if (roomsDb[roomId]) {
      roomsDb[roomId].messages = [];
      saveDb();
    }

    // Broadcast clear event to instantly wipe local state for connected clients
    broadcastToRoom(roomId, {
      type: "clear",
    });

    res.json({ success: true, message: "Oda geçmişi tamamen sıfırlandı." });
  });

  // Serve static files / Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
