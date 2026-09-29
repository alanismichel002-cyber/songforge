// Suno API requires a callBackUrl on every task. The app polls for results,
// so this endpoint only acknowledges the callback.
exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ok: true }),
});
