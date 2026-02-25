import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

let _prisma: PrismaClient | null = null;
function getPrismaClient(): PrismaClient {
	if (_prisma) return _prisma;
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL is not set");
	}
	const pool = new Pool({ connectionString });
	const adapter = new PrismaPg(pool);
	_prisma = new PrismaClient({ adapter });
	return _prisma;
}

const prismaProxy = new Proxy(
	{},
	{
		get(_target, prop) {
			const client = getPrismaClient();
			// @ts-ignore
			return (client as any)[prop];
		},
		apply(_target, _thisArg, args) {
			const client = getPrismaClient();
			// @ts-ignore
			return (client as any).apply(_thisArg, args);
		},
	}
);

export default prismaProxy as unknown as PrismaClient;
