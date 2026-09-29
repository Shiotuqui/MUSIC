// Acknowledges Suno API task callbacks. The app polls task status itself,
// so nothing needs to be stored here.
export default async () =>
  new Response(JSON.stringify({ code: 200, msg: "received" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
