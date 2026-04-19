import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureSystemAbilityTags, inferAbilitySubject } from "@/lib/ability-tags";
import { forbidden, unauthorized } from "@/lib/api-errors";

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized();

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return unauthorized("No user found in DB");

    await ensureSystemAbilityTags();

    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get("subjectId");
    const onlyUnclassified = searchParams.get("onlyUnclassified") !== "false";

    let selectedSubjectKey: string | undefined;
    if (subjectId) {
        const subject = await prisma.subject.findFirst({
            where: { id: subjectId, userId: user.id },
            select: { name: true },
        });
        if (!subject) return forbidden("Notebook not found or not owned by current user");
        selectedSubjectKey = inferAbilitySubject(subject.name);
    }

    const availableTags = await prisma.abilityTag.findMany({
        where: {
            ...(selectedSubjectKey ? { subject: selectedSubjectKey } : {}),
            OR: [
                { isSystem: true },
                { userId: user.id },
            ],
        },
        select: { subject: true },
    });
    const availableSubjects = new Set(availableTags.map(tag => tag.subject));

    if (selectedSubjectKey && !availableSubjects.has(selectedSubjectKey)) {
        return NextResponse.json({
            count: 0,
            totalCandidates: 0,
            availableTagCount: 0,
            availableSubjects: Array.from(availableSubjects),
            message: "当前学科暂无能力标签库",
        });
    }

    const items = await prisma.errorItem.findMany({
        where: {
            userId: user.id,
            ...(subjectId ? { subjectId } : {}),
            ...(onlyUnclassified ? { abilityTagLinks: { none: {} } } : {}),
        },
        select: {
            id: true,
            subject: { select: { name: true } },
        },
    });

    const analyzable = items.filter(item => availableSubjects.has(inferAbilitySubject(item.subject?.name)));

    return NextResponse.json({
        count: analyzable.length,
        totalCandidates: items.length,
        availableTagCount: availableTags.length,
        availableSubjects: Array.from(availableSubjects),
    });
}
