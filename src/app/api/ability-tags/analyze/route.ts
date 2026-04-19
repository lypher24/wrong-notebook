import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAIService } from "@/lib/ai";
import { ensureSystemAbilityTags, inferAbilitySubject, normalizeAbilityTagNames } from "@/lib/ability-tags";
import { forbidden, unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:ability-tags:analyze');

type SummaryCandidate = {
    mistakeStatus?: string | null;
    knowledgePoints?: string | null;
    tags?: { name: string }[];
};

function parseKnowledgePoints(item: { knowledgePoints?: string | null; tags?: { name: string }[] }) {
    if (item.tags && item.tags.length > 0) {
        return item.tags.map(tag => tag.name);
    }
    if (!item.knowledgePoints) return [];
    try {
        const parsed = JSON.parse(item.knowledgePoints);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

function buildOverallSummary(items: SummaryCandidate[]) {
    const statusStats = new Map<string, number>();
    const tagStats = new Map<string, number>();

    for (const item of items) {
        const status = item.mistakeStatus || 'unknown';
        statusStats.set(status, (statusStats.get(status) || 0) + 1);
        for (const tag of parseKnowledgePoints(item)) {
            tagStats.set(tag, (tagStats.get(tag) || 0) + 1);
        }
    }

    const topTags = Array.from(tagStats.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => `${name}(${count})`)
        .join('、') || '无';

    const statuses = Array.from(statusStats.entries())
        .map(([name, count]) => `${name}:${count}`)
        .join('、') || '无';

    return `本批候选错题共 ${items.length} 道。作答状态分布：${statuses}。高频知识点：${topTags}。`;
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized();

    try {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (!user) return unauthorized("No user found in DB");

        await ensureSystemAbilityTags();

        const body = await req.json();
        const subjectId = body.subjectId as string | undefined;
        const onlyUnclassified = body.onlyUnclassified !== false;
        const batchSize = Math.min(20, Math.max(1, Number(body.batchSize || 8)));
        const offset = Math.max(0, Number(body.offset || 0));

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
            orderBy: [
                { subject: 'asc' },
                { order: 'asc' },
                { name: 'asc' },
            ],
        });

        const availableSubjects = new Set(availableTags.map(tag => tag.subject));
        if (selectedSubjectKey && !availableSubjects.has(selectedSubjectKey)) {
            return NextResponse.json({
                processed: 0,
                updated: 0,
                remaining: 0,
                nextOffset: offset,
                message: "当前学科暂无能力标签库",
                items: [],
            });
        }

        const allCandidates = await prisma.errorItem.findMany({
            where: {
                userId: user.id,
                ...(subjectId ? { subjectId } : {}),
                ...(onlyUnclassified ? { abilityTagLinks: { none: {} } } : {}),
            },
            orderBy: { createdAt: 'asc' },
            include: {
                subject: true,
                tags: true,
                abilityTagLinks: { include: { abilityTag: true } },
            },
        });

        const analyzableCandidates = allCandidates.filter(item =>
            availableSubjects.has(inferAbilitySubject(item.subject?.name))
        );

        const batch = onlyUnclassified
            ? analyzableCandidates.slice(0, batchSize)
            : analyzableCandidates.slice(offset, offset + batchSize);

        if (batch.length === 0) {
            return NextResponse.json({
                processed: 0,
                updated: 0,
                remaining: 0,
                nextOffset: offset,
                items: [],
            });
        }

        const aiService = getAIService();
        const results = await aiService.analyzeAbilityTags(
            batch.map(item => ({
                id: item.id,
                subject: inferAbilitySubject(item.subject?.name),
                questionText: item.questionText,
                answerText: item.answerText,
                analysis: item.analysis,
                knowledgePoints: parseKnowledgePoints(item),
                wrongAnswerText: item.wrongAnswerText,
                mistakeAnalysis: item.mistakeAnalysis,
                mistakeStatus: item.mistakeStatus,
            })),
            availableTags.map(tag => ({
                name: tag.name,
                subject: tag.subject,
                description: tag.description,
            })),
            buildOverallSummary(analyzableCandidates)
        );

        const tagBySubjectAndName = new Map<string, { id: string; name: string; subject: string }>();
        for (const tag of availableTags) {
            tagBySubjectAndName.set(`${tag.subject}:${tag.name}`, tag);
        }

        const batchById = new Map(batch.map(item => [item.id, item]));
        const updatedItems: { id: string; tags: string[] }[] = [];

        for (const result of results) {
            const item = batchById.get(result.errorItemId);
            if (!item) continue;

            const subjectKey = inferAbilitySubject(item.subject?.name);
            const tagIds = normalizeAbilityTagNames(result.tags)
                .map(name => tagBySubjectAndName.get(`${subjectKey}:${name}`))
                .filter(Boolean)
                .map(tag => tag!.id);

            await prisma.$transaction(async (tx) => {
                await tx.errorItemAbilityTag.deleteMany({
                    where: { errorItemId: item.id },
                });

                for (const tagId of tagIds) {
                    await tx.errorItemAbilityTag.create({
                        data: {
                            errorItemId: item.id,
                            abilityTagId: tagId,
                            source: 'ai',
                        },
                    });
                }
            });

            updatedItems.push({
                id: item.id,
                tags: tagIds
                    .map(id => availableTags.find(tag => tag.id === id)?.name)
                    .filter(Boolean) as string[],
            });
        }

        const processed = batch.length;
        const remaining = onlyUnclassified
            ? Math.max(0, analyzableCandidates.length - processed)
            : Math.max(0, analyzableCandidates.length - (offset + processed));

        return NextResponse.json({
            processed,
            updated: updatedItems.length,
            remaining,
            nextOffset: onlyUnclassified ? 0 : offset + processed,
            items: updatedItems,
        });
    } catch (error) {
        logger.error({ error }, 'Ability tag batch analysis failed');
        return internalError("Failed to analyze ability tags");
    }
}
