import express from "express";
import { getBlock, getBlocks } from "@src/db/blocksProvider";
import { getDeployment } from "@src/providers/apiNodeProvider";
import { getGraphData, getProviderActiveLeasesGraphData, getProviderGraphData } from "@src/db/statsProvider";
import { round } from "@src/utils/math";
import { isValidBech32Address } from "@src/utils/addresses";
import { getAkashPricing, getAWSPricing, getAzurePricing, getGCPPricing } from "@src/utils/pricing";
import asyncHandler from "express-async-handler";
import { ProviderStatsKey } from "@src/types/graph";
import { cacheKeys, cacheResponse } from "@src/caching/helpers";
import axios from "axios";
import { getAuditors, getProviderAttributesSchema } from "@src/providers/githubProvider";
import { getProviderRegions } from "@src/db/providerDataProvider";
import { OpenAPIHono } from "@hono/zod-openapi";

import { swaggerUI } from "@hono/swagger-ui";
import routesV1 from "../routes/v1";
import routesV2 from "../routes/v2";

export const apiRouter = express.Router();

apiRouter.get(
  "/blocks",
  asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit?.toString());
    const blocks = await getBlocks(limit || 20);

    res.send(blocks);
  })
);

export const apiRouterHono = new OpenAPIHono();

function registerApiVersion(version: string, baseRouter: OpenAPIHono, versionRoutes: OpenAPIHono[]) {
  const versionRouter = new OpenAPIHono();
  versionRouter.doc(`/doc`, {
    openapi: "3.0.0",
    servers: [
      { url: `http://localhost:8787/api/${version}`, description: "Localhost" },
      { url: `https://api-preview.cloudmos.io/api/${version}`, description: "Online Preview" },
    ], // TODO
    info: {
      title: "Cloudmos API",
      description: "Access Akash data from our indexer",
      version: version
    }
  });
  const swaggerInstance = swaggerUI({ url: `/api/${version}/doc` });

  versionRouter.get(`/swagger`, swaggerInstance);
  versionRouter.get(`/swagger/`, swaggerInstance);
  console.log(versionRoutes[0]);
  versionRoutes.forEach((route) => versionRouter.route(`/`, route));
  baseRouter.route(`/${version}`, versionRouter);
}

registerApiVersion("v1", apiRouterHono, routesV1);
registerApiVersion("v2", apiRouterHono, routesV2);

// routesV1.forEach((route) => {
//   apiRouterHono.doc("/v1/doc", {
//     openapi: "3.0.0",
//     servers: [{ url: "http://localhost:8787/api/v1", description: "Local" }],
//     info: {
//       title: "Cloudmos API",
//       description: "Access Akash data from our indexer",
//       version: packageJson.version
//     }
//   });
//   apiRouterHono.get("/v1/swagger", swaggerUI({ url: "/api/v1/doc" }));
//   apiRouterHono.route("/v1", route);
// });

// function parseNumberParam(val, ctx) {
//   const parsed = parseInt(val);
//   if (isNaN(parsed)) {
//     ctx.addIssue({
//       code: z.ZodIssueCode.custom,
//       message: "Not a number"
//     });
//     return z.NEVER;
//   }
//   return parsed;
// }

