import {onRequest} from "firebase-functions/v2/https";

export const healthCheck = onRequest(
  {
    region: "asia-northeast1",
    invoker: "public",
    timeoutSeconds: 10,
    memory: "256MiB",
    maxInstances: 2,
  },
  (request, response) => {
    response.set("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(request.method)) {
      response.status(405).json({status: "method_not_allowed"});
      return;
    }
    response.status(200).json({
      status: "ok",
      service: "aizu-connect-functions",
      checkedAt: new Date().toISOString(),
    });
  },
);
