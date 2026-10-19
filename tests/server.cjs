const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const files = { "/": ["index.html", "text/html"], "/index.html": ["index.html", "text/html"], "/generator.js": ["generator.js", "text/javascript"], "/app.js": ["app.js", "text/javascript"], "/style.css": ["style.css", "text/css"] };
files["/reference.js"] = ["reference.js", "text/javascript"];
files["/guide.js"] = ["guide.js", "text/javascript"];
http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = Object.hasOwn(files, pathname) ? files[pathname] : null;
  if (!file) { res.writeHead(404); res.end("Not found"); return; }
  fs.readFile(path.join(root, file[0]), (error, data) => {
    if (error) { console.error(error); res.writeHead(500); res.end("Unable to read asset"); return; }
    res.setHeader("Content-Type", file[1] + "; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(data);
  });
}).listen(4173, "127.0.0.1", () => console.log("Actions Lab: http://127.0.0.1:4173"));
