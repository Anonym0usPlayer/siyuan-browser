import http from "node:http";
http
  .createServer((req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.end(
      "[Adblock Plus 2.0]\n! Local deterministic test list\n|http://127.0.0.1:17839/blocked^\n",
    );
  })
  .listen(17840, "127.0.0.1", () =>
    console.log("Filter fixture: http://127.0.0.1:17840/list.txt"),
  );
