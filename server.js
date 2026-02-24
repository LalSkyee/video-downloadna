const express = require("express");
const { exec, spawn } = require("child_process");
const cors = require("cors");

const app = express();
app.use(cors());

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

/* ---------- GET FORMATS ---------- */
app.get("/formats", (req, res) => {

  const url = req.query.url;

  const process = spawn("yt-dlp", [
    "-J",
    url
  ]);

  let data = "";

  process.stdout.on("data", chunk => {
    data += chunk;
  });

  process.on("close", (code) => {

  if (!data) {
    return res.status(500).json({ error: "yt-dlp returned empty data" });
  }

  let info;

  try {
    info = JSON.parse(data);
  } catch (err) {
    console.log("Invalid JSON from yt-dlp:", data);
    return res.status(500).json({ error: "yt-dlp failed to parse JSON" });
  }

  if (!info || !info.formats) {
    return res.status(500).json({ error: "No formats found" });
  }

 const bestFormats = {};

info.formats.forEach(f => {

  // must have video + resolution
  if (
  f.vcodec !== "none" &&   // must have video
  f.height
) {

    // use filesize or approximate size
    const size = f.filesize || f.filesize_approx;
    if (!size) return;

    const key = f.height;

    // keep the largest file per resolution
    if (
      !bestFormats[key] ||
      size > bestFormats[key].sizeBytes
    ) {

      bestFormats[key] = {
        format_id: f.format_id,
        resolution: f.height + "p",
        size: (size / 1024 / 1024).toFixed(1) + " MB",
        sizeBytes: size
      };

    }

  }

});

const cleaned = Object.values(bestFormats)



  .sort((a, b) =>
    parseInt(a.resolution) - parseInt(b.resolution)
  );

// remove helper field
cleaned.forEach(f => delete f.sizeBytes);

    res.json({
      title: info.title,
      duration: info.duration_string,
      platform: info.extractor,
      thumbnail: info.thumbnail,
      formats: cleaned
    });

  });

});


/* ---------- DOWNLOAD ---------- */

let progressValue = 0;

app.get("/progress", (req, res) => {
  res.json({ progress: progressValue });
});

app.get("/download", (req, res) => {

  const url = req.query.url;
  const format = req.query.format;
  if (!url) return res.send("Missing URL");

  let title = req.query.title || "video";

  title = title
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) title = "video";

  const output = `${title}.mp4`;

  const process = spawn("yt-dlp", [
    "-f",
    format ? `${format}+bestaudio` : "bv*+ba/b",
    "--merge-output-format",
    "mp4",
    "--no-playlist",
    "-o",
    output,
    url
  ]);

  process.on("close", () => {

    res.download(output, output, () => {
      require("fs").unlinkSync(output); // delete after sending
    });

  });

});

app.get("/download-mp3", (req, res) => {

  const url = req.query.url;
  if (!url) return res.send("Missing URL");

  let title = req.query.title || "audio";

  title = title
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim();

  const output = `${title}.mp3`;

  const process = spawn("yt-dlp", [
    "-x",
    "--audio-format",
    "mp3",
    "--no-playlist",
    "-o",
    output,
    url
  ]);

  process.on("close", () => {
    res.download(output, output, () => {
      require("fs").unlinkSync(output);
    });
  });

});


/* ---------- SERVER ---------- */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});