import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import path from "path";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Multer setup (memory storage)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Health check
app.get("/", (req, res) => res.json({ message: "Melodify API running 🚀" }));

// Get all songs
app.get("/songs", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("songs_metadata")
      .select("*")
      .order("id", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload audio file
app.post("/upload/audio", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

    const fileExt = path.extname(req.file.originalname);
    const fileName = `song_${Date.now()}${fileExt}`;

    const { error } = await supabase.storage
      .from("songs")
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

    if (error) return res.status(500).json({ error: error.message });

    const { data } = supabase.storage.from("songs").getPublicUrl(fileName);
    const publicUrl = data.publicUrl;

    res.json({ audio_url: publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload cover image
app.post("/upload/cover", upload.single("cover"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No cover file uploaded" });

    const fileExt = path.extname(req.file.originalname);
    const fileName = `cover_${Date.now()}${fileExt}`;

    const { error } = await supabase.storage
      .from("covers")
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

    if (error) return res.status(500).json({ error: error.message });

    const { data } = supabase.storage.from("covers").getPublicUrl(fileName);
    const publicUrl = data.publicUrl;

    res.json({ cover_url: publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new song metadata
app.post("/songs", async (req, res) => {
  try {
    console.log("Received metadata:", req.body); // ← Added this line for debugging

    const { title, artist, album, genre, audio_url, cover_url } = req.body;

    if (!title || !artist || !audio_url || !cover_url) {
      return res.status(400).json({ error: "Title, Artist, audio_url, and cover_url are required" });
    }

    const { data, error } = await supabase
      .from("songs_metadata")
      .insert([{ title, artist, album, genre, audio_url, cover_url }])
      .select();

    if (error) return res.status(500).json({ error: error.message });

    res.status(201).json({ message: "Song uploaded successfully", song: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => console.log(`✅ Melodify API running on http://localhost:${port}`));
