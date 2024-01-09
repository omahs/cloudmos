import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getTransaction } from "@src/db/transactionsProvider";
import { getValidator } from "@src/providers/apiNodeProvider";
import { isValidBech32Address } from "@src/utils/addresses";

const route = createRoute({
  method: "get",
  path: "/validators/{address}",
  request: {
    params: z.object({
      address: z.string().openapi({
        param: { name: "address", in: "path" },
        description: "Validator Address",
        example: "akashvaloper14mt78hz73d9tdwpdvkd59ne9509kxw8yj7qy8f"
      })
    })
  },
  responses: {
    200: {
      description: "Return a validator information",
      content: {
        "application/json": {
          schema: z.object({
            operatorAddress: z.string(),
            address: z.string().nullable(),
            moniker: z.string(),
            keybaseUsername: z.string().nullable(),
            keybaseAvatarUrl: z.string().nullable(),
            votingPower: z.number(),
            commission: z.number(),
            maxCommission: z.number(),
            maxCommissionChange: z.number(),
            identity: z.string(),
            description: z.string(),
            website: z.string(),
            rank: z.number()
          })
        }
      }
    },
    400: {
      description: "Invalid address"
    },
    404: {
      description: "Validator not found"
    }
  }
});

export default new OpenAPIHono().openapi(route, async (c) => {
  if (!isValidBech32Address(c.req.valid("param").address, "akashvaloper")) {
    return c.text("Invalid address", 400);
  }

  const validator = await getValidator(c.req.valid("param").address);

  if (!validator) {
    return c.text("Validator not found", 404);
  }

  c.json(validator);
});
