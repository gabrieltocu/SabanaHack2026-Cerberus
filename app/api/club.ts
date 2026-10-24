// Vercel Function for the club API (robot + socio/concierge app). See vercel.json rewrites.
import { clubPath, createClubServer } from '../src/club/server';

const app = createClubServer(process.env);
const handler = (req: Request) => app(req, clubPath(new URL(req.url)));

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
