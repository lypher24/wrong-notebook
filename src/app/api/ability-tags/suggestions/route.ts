import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureSystemAbilityTags } from "@/lib/ability-tags";
import { unauthorized } from "@/lib/api-errors";

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized();

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return unauthorized("No user found in DB");

    await ensureSystemAbilityTags();

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const subject = searchParams.get("subject") || undefined;

    const tags = await prisma.abilityTag.findMany({
        where: {
            ...(subject ? { subject } : {}),
            ...(q ? { name: { contains: q } } : {}),
            OR: [
                { isSystem: true },
                { userId: user.id },
            ],
        },
        orderBy: [
            { order: 'asc' },
            { name: 'asc' },
        ],
        take: 20,
    });

    return NextResponse.json({ suggestions: tags.map(tag => tag.name) });
}
