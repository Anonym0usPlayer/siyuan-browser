import http from "node:http";
import fs from "node:fs/promises";
http
  .createServer(async (req, res) => {
    if (req.url === "/image.png") {
      res.setHeader("Content-Type", "image/png");
      res.end(await fs.readFile("icon.png"));
    } else {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(await fs.readFile("tests/fixtures/math.html"));
    }
  })
  .listen(17841, "127.0.0.1", () =>
    console.log("Math fixture: http://127.0.0.1:17841/article"),
  );
