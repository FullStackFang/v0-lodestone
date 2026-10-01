import { getAuth } from "@/auth/server";

export async function GET(request: Request) { return (await getAuth()).handler(request); }
export async function POST(request: Request) { return (await getAuth()).handler(request); }
