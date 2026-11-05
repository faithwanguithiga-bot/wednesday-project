import { getStore } from "@netlify/blobs";
import { handle } from "../lib/logic.mjs";

export default async (req) => handle(req, getStore("wednesday"), process.env.LEADER_PIN);

export const config = { path: "/api/*" };
