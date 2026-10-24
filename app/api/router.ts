// Vercel Function entry: every /api/v1/* request is rewritten here (see vercel.json).
import { toFetchHandler } from '../src/api/http';
import { createServerApp } from '../src/api/server';

const handler = toFetchHandler(createServerApp(process.env));

export const GET = handler;
export const POST = handler;
