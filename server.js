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

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Supabase client (only anon)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Health check
app.get("/", (req, res) => res.json({ message: "Melodify API running 🚀" }));

// -------------------- Songs -------------------- //

// Get all songs
app.get("/songs", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("songs_metadata")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      console.error("Supabase fetch error:", error);
      return res.status(500).json({ error: error.message });
    }

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
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (error) return res.status(500).json({ error: error.message });

    const { data } = supabase.storage.from("songs").getPublicUrl(fileName);
    res.json({ audio_url: data.publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload reel audio file
app.post("/upload/reel_audio", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

    const fileExt = path.extname(req.file.originalname);
    const fileName = `song_${Date.now()}${fileExt}`;

    const { error } = await supabase.storage
      .from("reel_audio")
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

    if (error) return res.status(500).json({ error: error.message });

    const { data } = supabase.storage.from("reel_audio").getPublicUrl(fileName);
    const publicUrl = data.publicUrl;

    res.json({ audio_url: publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




// Upload cover
app.post("/upload/cover", upload.single("cover"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No cover file uploaded" });

    const fileExt = path.extname(req.file.originalname);
    const fileName = `cover_${Date.now()}${fileExt}`;

    const { error } = await supabase.storage
      .from("covers")
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (error) return res.status(500).json({ error: error.message });

    const { data } = supabase.storage.from("covers").getPublicUrl(fileName);
    res.json({ cover_url: data.publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add song metadata
app.post("/songs", async (req, res) => {
  try {
    const { title, artist, album, genre, audio_url, cover_url, reel_audio_url, lyrics } = req.body;

    if (!title || !artist || !audio_url || !cover_url) {
      return res.status(400).json({ error: "Title, Artist, audio_url, and cover_url are required" });
    }

    const { data, error } = await supabase
      .from("songs_metadata")
      .insert([{ title, artist, album, genre, audio_url, cover_url, reel_audio_url, lyrics }])
      .select();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ message: "Song uploaded successfully", song: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- Auth -------------------- //

// Signup
app.post("/auth/signup", async (req, res) => {
  try {
    const { email, password, username } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email & password required" });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: "Account created", user: data.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- Resend Verification Email -------------------- //
app.post("/auth/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const { data, error } = await supabase.auth.resendVerificationEmail({ email });
    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: `Verification email resent to ${email}` });
  } catch (err) {
    console.error("Resend verification error:", err);
    res.status(500).json({ error: err.message });
  }
});


// Login
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email & password required" });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: "Login successful", session: data.session, user: data.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- Protected Routes -------------------- //

// Middleware
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: "Invalid token" });

    req.user = data.user;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Current session
app.get("/auth/session", authenticateUser, async (req, res) => {
  res.json({ user: req.user });
});



// -------------------- Logout -------------------- //
app.post("/auth/logout", authenticateUser, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(400).json({ error: "Missing auth token" });

    // Call Supabase to revoke the session
    const { error } = await supabase.auth.signOut(); // revokes current session server-side
    if (error) {
      console.error("Supabase logout error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: err.message });
  }
});


// Get current user's profile (email only)
app.get("/profile", authenticateUser, async (req, res) => {
  try {
    res.json({ profile: { email: req.user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// -------------------- Like song -------------------- //
// -------------------- Like song -------------------- //
app.post("/songs/:songId/toggle-like", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const songId = Number(req.params.songId);

    // Check if song exists
    const { data: songData, error: songError } = await supabase
      .from("songs_metadata")
      .select("*")
      .eq("id", songId)
      .single();

    if (songError || !songData) {
      return res.status(404).json({ error: "Song not found" });
    }

    // Check if user already liked this song
    const { data: likeData, error: likeError } = await supabase
      .from("liked_songs")
      .select("*")
      .eq("user_id", userId)
      .eq("song_id", songId)
      .single();

    if (likeError && likeError.code !== "PGRST116") { // PGRST116 = no rows found
      return res.status(500).json({ error: likeError.message });
    }

    let liked = true;

    if (!likeData) {
      // Create like
      await supabase.from("liked_songs").insert([{ user_id: userId, song_id: songId }]);
    } else {
      // Toggle: remove like
      liked = false;
      await supabase
        .from("liked_songs")
        .delete()
        .eq("user_id", userId)
        .eq("song_id", songId);
    }

    // Count total likes
    const { count } = await supabase
      .from("liked_songs")
      .select("*", { count: "exact", head: true })
      .eq("song_id", songId);

    res.json({
      message: "Toggle like success",
      user: userId,
      song: songData.title,
      liked,
      likes_count: count,
    });

  } catch (err) {
    console.error("Toggle like error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get total likes count for a song
app.get("/songs/:songId/likes-count", async (req, res) => {
  try {
    const songId = req.params.songId;

    const { count, error } = await supabase
      .from("liked_songs")
      .select("*", { count: "exact", head: true }) // head: true to only count
      .eq("song_id", songId);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Get liked songs
app.get("/me/likes", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("liked_songs")
      .select("created_at, song: songs_metadata(*)")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ likes: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Playlists
app.post("/playlists", authenticateUser, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Playlist name required" });

    const { data, error } = await supabase
      .from("playlists")
      .insert([{ name, user_id: req.user.id }])
      .select();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Playlist created", playlist: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/playlists/:id/songs", authenticateUser, async (req, res) => {
  try {
    const playlistId = Number(req.params.id);
    const { song_id } = req.body;

    const { data, error } = await supabase
      .from("playlist_songs")
      .insert([{ playlist_id: playlistId, song_id }])
      .select();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Song added to playlist", entry: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/me/playlists", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("playlists")
      .select(`
        id,
        name,
        created_at,
        playlist_songs (
          id,
          song: songs_metadata (*)
        )
      `)
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ playlists: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- Start -------------------- //
app.listen(port, () => console.log(`✅ Melodify API running on http://localhost:${port}`));
