import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAIService } from "@/lib/ai";
import { ensureSystemAbilityTags, inferAbilitySubject } from "@/lib/ability-tags";
import { badRequest, unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:ability-tags:analyze');

type KnowledgePointSource = { knowledgePoints?: string | null; tags?: { name: string }[] };
type SummaryCandidate = KnowledgePointSource & {
    subject?: { name?: string | null } | null;
    gradeSemester?: string | null;
    mistakeStatus?: string | null;
};

type TagRef = { id: string; name: string; subject: string; isSystem: boolean; userId?: string | null };

type AnalyzeItemResponse = {
    id: string;
    generatedTags: string[];
    libraryTags: string[];
    finalTags: string[];
    status: 'updated' | 'skipped' | 'no_result';
    reason?: string;
};

function parseKnowledgePoints(item: KnowledgePointSource) {
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

function normalizeTagNames(names: unknown, max = 2): string[] {
    if (!Array.isArray(names)) return [];
    return names
        .map(name => String(name || '').trim())
        .filter(Boolean)
        .filter((name, index, arr) => arr.indexOf(name) === index)
        .slice(0, max);
}

function buildOverallSummary(items: SummaryCandidate[]) {
    const subjectStats = new Map<string, number>();
    const gradeStats = new Map<string, number>();
    const statusStats = new Map<string, number>();
    const tagStats = new Map<string, number>();

    for (const item of items) {
        const subject = inferAbilitySubject(item.subject?.name);
        subjectStats.set(subject, (subjectStats.get(subject) || 0) + 1);

        const grade = item.gradeSemester || 'unknown';
        gradeStats.set(grade, (gradeStats.get(grade) || 0) + 1);

        const status = item.mistakeStatus || 'unknown';
        statusStats.set(status, (statusStats.get(status) || 0) + 1);

        for (const tag of parseKnowledgePoints(item)) {
            tagStats.set(tag, (tagStats.get(tag) || 0) + 1);
        }
    }

    const formatStats = (stats: Map<string, number>, limit = 10) => Array.from(stats.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, count]) => `${name}:${count}`)
        .join('、') || '无';

    const topKnowledgePoints = Array.from(tagStats.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([name, count]) => `${name}(${count})`)
        .join('、') || '无';

    return [
        `本次用户主动选中错题共 ${items.length} 道。`,
        `学科分布：${formatStats(subjectStats)}。`,
        `年级/学期分布：${formatStats(gradeStats, 6)}。`,
        `作答状态分布：${formatStats(statusStats)}。`,
        `高频知识点：${topKnowledgePoints}。`,
        `请先基于这些分布和错题内容归纳共性薄弱点，再把薄弱点反向关联到每道题。`,
    ].join('');
}

async function findOrCreateGeneratedTag(
    tx: Prisma.TransactionClient,
    tagName: string,
    subject: string,
    userId: string,
    systemTagBySubjectAndName: Map<string, TagRef>,
    createdGeneratedTagKeys: Set<string>
): Promise<TagRef> {
    const systemTag = systemTagBySubjectAndName.get(`${subject}:${tagName}`);
    if (systemTag) return systemTag;

    const existing = await tx.abilityTag.findFirst({
        where: {
            name: tagName,
            subject,
            userId,
            isSystem: false,
        },
        select: { id: true, name: true, subject: true, isSystem: true, userId: true },
    });
    if (existing) return existing;

    const created = await tx.abilityTag.create({
        data: {
            name: tagName,
            subject,
            isSystem: false,
            userId,
            description: 'AI 根据一组选中错题自动归纳的能力薄弱点',
            order: 1000,
        },
        select: { id: true, name: true, subject: true, isSystem: true, userId: true },
    });
    createdGeneratedTagKeys.add(`${subject}:${tagName}`);
    return created;
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized();

    try {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (!user) return unauthorized("No user found in DB");

        await ensureSystemAbilityTags();

        const body = await req.json();
        const selectedIds: string[] = Array.isArray(body.errorItemIds)
            ? body.errorItemIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
            : [];
        const errorItemIds: string[] = Array.from(new Set(selectedIds));

        if (errorItemIds.length === 0) {
            return badRequest("Please select at least one error item");
        }

        const selectedItems = await prisma.errorItem.findMany({
            where: {
                userId: user.id,
                id: { in: errorItemIds },
            },
            include: {
                subject: true,
                tags: true,
                abilityTagLinks: {
                    include: { abilityTag: true },
                    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
                },
            },
        });

        const itemById = new Map(selectedItems.map(item => [item.id, item]));
        const orderedItems = errorItemIds.map(id => itemById.get(id)).filter(Boolean) as typeof selectedItems;

        if (orderedItems.length === 0) {
            return NextResponse.json({
                selected: errorItemIds.length,
                processed: 0,
                updated: 0,
                skipped: errorItemIds.length,
                noResult: errorItemIds.length,
                invalidTags: 0,
                createdGeneratedTags: 0,
                batchSummary: '',
                commonPatterns: [],
                items: [],
                message: '没有找到可分析的选中错题',
            });
        }

        const selectedSubjects = Array.from(new Set(orderedItems.map(item => inferAbilitySubject(item.subject?.name))));
        const systemLibraryTags = await prisma.abilityTag.findMany({
            where: {
                isSystem: true,
                subject: { in: selectedSubjects },
            },
            orderBy: [
                { subject: 'asc' },
                { order: 'asc' },
                { name: 'asc' },
            ],
            select: { id: true, name: true, subject: true, description: true, isSystem: true, userId: true },
        });

        const aiService = getAIService();
        const aiResult = await aiService.analyzeAbilityTags(
            orderedItems.map(item => ({
                id: item.id,
                subject: inferAbilitySubject(item.subject?.name),
                gradeSemester: item.gradeSemester,
                questionText: item.questionText,
                answerText: item.answerText,
                analysis: item.analysis,
                knowledgePoints: parseKnowledgePoints(item),
                wrongAnswerText: item.wrongAnswerText,
                mistakeAnalysis: item.mistakeAnalysis,
                mistakeStatus: item.mistakeStatus,
                existingAbilityTags: item.abilityTagLinks.map(link => ({
                    name: link.abilityTag.name,
                    source: link.source,
                })),
            })),
            systemLibraryTags.map(tag => ({
                name: tag.name,
                subject: tag.subject,
                description: tag.description,
            })),
            buildOverallSummary(orderedItems)
        );

        const systemTagBySubjectAndName = new Map<string, TagRef>();
        for (const tag of systemLibraryTags) {
            systemTagBySubjectAndName.set(`${tag.subject}:${tag.name}`, tag);
        }

        const aiResultById = new Map<string, typeof aiResult.items[number]>();
        for (const result of aiResult.items) {
            if (!aiResultById.has(result.errorItemId)) {
                aiResultById.set(result.errorItemId, result);
            }
        }

        const responseItems: AnalyzeItemResponse[] = [];
        const createdGeneratedTagKeys = new Set<string>();
        let invalidTags = 0;

        await prisma.$transaction(async (tx) => {
            await tx.errorItemAbilityTag.deleteMany({
                where: {
                    errorItemId: { in: orderedItems.map(item => item.id) },
                    source: 'ai',
                },
            });

            for (const item of orderedItems) {
                const result = aiResultById.get(item.id);
                if (!result) {
                    responseItems.push({
                        id: item.id,
                        generatedTags: [],
                        libraryTags: [],
                        finalTags: [],
                        status: 'no_result',
                    });
                    continue;
                }

                const subjectKey = inferAbilitySubject(item.subject?.name);
                const manualTagIds = new Set(
                    item.abilityTagLinks
                        .filter(link => link.source === 'manual')
                        .map(link => link.abilityTagId)
                );
                const manualTagNames = new Set(
                    item.abilityTagLinks
                        .filter(link => link.source === 'manual')
                        .map(link => link.abilityTag.name)
                );
                const usedTagIds = new Set<string>();
                const usedTagNames = new Set<string>();
                const finalTags: { id: string; name: string; sourceGroup: 'generated' | 'library'; order: number }[] = [];

                const generatedTags = normalizeTagNames(result.generatedTags, 2);
                const libraryTags = normalizeTagNames(result.libraryTags, 2);

                for (const [index, tagName] of generatedTags.entries()) {
                    const tag = await findOrCreateGeneratedTag(tx, tagName, subjectKey, user.id, systemTagBySubjectAndName, createdGeneratedTagKeys);
                    if (usedTagIds.has(tag.id) || usedTagNames.has(tag.name)) continue;
                    usedTagIds.add(tag.id);
                    usedTagNames.add(tag.name);
                    finalTags.push({ id: tag.id, name: tag.name, sourceGroup: 'generated', order: index });
                }

                for (const [index, tagName] of libraryTags.entries()) {
                    const tag = systemTagBySubjectAndName.get(`${subjectKey}:${tagName}`);
                    if (!tag) {
                        invalidTags += 1;
                        continue;
                    }
                    if (usedTagIds.has(tag.id) || usedTagNames.has(tag.name)) continue;
                    usedTagIds.add(tag.id);
                    usedTagNames.add(tag.name);
                    finalTags.push({ id: tag.id, name: tag.name, sourceGroup: 'library', order: 10 + index });
                }

                for (const tag of finalTags) {
                    if (manualTagIds.has(tag.id) || manualTagNames.has(tag.name)) continue;
                    await tx.errorItemAbilityTag.create({
                        data: {
                            errorItemId: item.id,
                            abilityTagId: tag.id,
                            source: 'ai',
                            order: tag.order,
                        },
                    });
                }

                responseItems.push({
                    id: item.id,
                    generatedTags,
                    libraryTags,
                    finalTags: finalTags.map(tag => tag.name),
                    status: finalTags.length > 0 ? 'updated' : 'skipped',
                    reason: result.reason,
                });
            }
        });

        const missingSelectedCount = Math.max(0, errorItemIds.length - orderedItems.length);
        const updated = responseItems.filter(item => item.status === 'updated').length;
        const skipped = responseItems.filter(item => item.status === 'skipped').length;
        const noResult = responseItems.filter(item => item.status === 'no_result').length + missingSelectedCount;

        return NextResponse.json({
            selected: errorItemIds.length,
            processed: orderedItems.length,
            updated,
            skipped,
            noResult,
            invalidTags,
            createdGeneratedTags: createdGeneratedTagKeys.size,
            batchSummary: aiResult.batchSummary || '',
            commonPatterns: aiResult.commonPatterns || [],
            items: responseItems,
        });
    } catch (error) {
        logger.error({ error }, 'Ability tag selected-item analysis failed');
        return internalError("Failed to analyze ability tags");
    }
}
