server.prependListener("request", (req, res) => {
  if (!req.url) return;

  if (req.url.startsWith("/soap")) {
    const origin = req.headers.origin;

    // ✅ Si viene Origin, lo reflejamos (mejor para CORS)
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    } else {
      // ✅ Para evitar “CORS error” en pruebas (puedes dejarlo así)
      res.setHeader("Access-Control-Allow-Origin", "*");
    }

    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, SOAPAction");

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
  }
});
