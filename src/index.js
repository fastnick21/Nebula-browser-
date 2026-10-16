// Nebula Browse backend for the Scramjet-App repository.
// Requires the ORIGINAL Scramjet-App package.json and public/ assets.
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));
logging.set_level(logging.NONE);

Object.assign(wisp.options, {
  allow_udp_streams: false,
  // Add destination domains you explicitly want to block here.
  hostname_blacklist: [
    /(^|\.)localhost$/i,
    /(^|\.)local$/i,
    /(^|\.)internal$/i,
    /(^|\.)metadata\.google\.internal$/i,
  ],
  dns_servers: ["1.1.1.3", "1.0.0.3"],
});

const app = Fastify({
  logger: true,
  serverFactory: (handler) =>
    createServer((req, res) => {
      // Scramjet needs these isolation headers in its default setup.
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      res.setHeader("X-Content-Type-Options", "nosniff");
      handler(req, res);
    }).on("upgrade", (req, socket, head) => {
      if (req.url?.split("?")[0].endsWith("/wisp/")) {
        wisp.routeRequest(req, socket, head);
      } else {
        socket.destroy();
      }
    }),
});

app.get("/health", async () => ({ ok: true, service: "nebula-browse" }));
app.register(fastifyStatic, { root: publicPath, decorateReply: true });
app.register(fastifyStatic, { root: scramjetPath, prefix: "/scram/", decorateReply: false });
app.register(fastifyStatic, { root: libcurlPath, prefix: "/libcurl/", decorateReply: false });
app.register(fastifyStatic, { root: baremuxPath, prefix: "/baremux/", decorateReply: false });
app.setNotFoundHandler((_req, reply) =>
  reply.code(404).type("text/html").sendFile("404.html")
);

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a number between 1 and 65535");
}

try {
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Nebula Browse listening on http://localhost:${port} (${hostname()})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

async function shutdown() {
  await app.close();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
