import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inferAbilitySubject, normalizeAbilityTagNames } from "@/lib/ability-tags";
import { forbidden, notFound, unauthorized, internalError } from "@/lib/api-errors";

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized();

    try {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (!user) return unauthorized("No user found in DB");

        const item = await prisma.errorItem.findUnique({
            where: { id },
            include: { subject: true },
        });
        if (!item) return notFound("Item not found");
        if (item.userId !== user.id) return forbidden("Not authorized to update this item");

        const body = await req.json();
        const tagNames = normalizeAbilityTagNames(body.abilityTags);
        const subjectKey = inferAbilitySubject(item.subject?.name);

        const tagIds: string[] = [];
        for (const tagName of tagNames) {
            let tag = await prisma.abilityTag.findFirst({
                where: {
                    name: tagName,
                    subject: subjectKey,
                    OR: [
                        { isSystem: true },
                        { userId: user.id },
                    ],
                },
                select: { id: true },
            });

            if (!tag) {
                tag = await prisma.abilityTag.create({
                    data: {
                        name: tagName,
                        subject: subjectKey,
                        isSystem: false,
                        userId: user.id,
                    },
                    select: { id: true },
                });
            }

            tagIds.push(tag.id);
        }

        await prisma.$transaction(async (tx) => {
            await tx.errorItemAbilityTag.deleteMany({
                where: { errorItemId: id },
            });

            for (const [index, tagId] of tagIds.entries()) {
                await tx.errorItemAbilityTag.create({
                    data: {
                        errorItemId: id,
                        abilityTagId: tagId,
                        source: 'manual',
                        order: 100 + index,
                    },
                });
            }
        });

        const updated = await prisma.errorItem.findUnique({
            where: { id },
            include: {
                abilityTagLinks: {
                    include: { abilityTag: true },
                    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
                },
            },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error(error);
        return internalError("Failed to update ability tags");
    }
}
