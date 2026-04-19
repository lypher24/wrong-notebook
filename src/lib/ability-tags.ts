import { prisma } from "@/lib/prisma";
import { SYSTEM_ABILITY_TAGS, type AbilitySubject } from "@/lib/ability-tag-data";
import { inferSubjectFromName } from "@/lib/knowledge-tags";

export type MistakeStatus = 'not_attempted' | 'wrong_attempt' | 'unknown';

export function normalizeMistakeStatus(status: unknown): MistakeStatus | undefined {
    if (status === 'not_attempted' || status === 'wrong_attempt' || status === 'unknown') {
        return status;
    }
    return undefined;
}

export function inferAbilitySubject(subjectName?: string | null): AbilitySubject {
    return (inferSubjectFromName(subjectName || null) || 'other') as AbilitySubject;
}

export async function ensureSystemAbilityTags() {
    for (const tag of SYSTEM_ABILITY_TAGS) {
        const existing = await prisma.abilityTag.findFirst({
            where: {
                code: tag.code,
            },
            select: { id: true },
        });

        if (existing) {
            await prisma.abilityTag.update({
                where: { id: existing.id },
                data: {
                    name: tag.name,
                    subject: tag.subject,
                    description: tag.description,
                    order: tag.order,
                    isSystem: true,
                },
            });
        } else {
            await prisma.abilityTag.create({
                data: {
                    code: tag.code,
                    name: tag.name,
                    subject: tag.subject,
                    description: tag.description,
                    order: tag.order,
                    isSystem: true,
                },
            });
        }
    }
}

export function formatMistakeStatus(status?: string | null) {
    switch (status) {
        case 'not_attempted':
            return '不会做';
        case 'wrong_attempt':
            return '做错了';
        case 'unknown':
        default:
            return '未判断';
    }
}

export function normalizeAbilityTagNames(names: unknown): string[] {
    if (!Array.isArray(names)) return [];
    return names
        .map((name) => String(name || '').trim())
        .filter(Boolean)
        .filter((name, index, arr) => arr.indexOf(name) === index)
        .slice(0, 4);
}
