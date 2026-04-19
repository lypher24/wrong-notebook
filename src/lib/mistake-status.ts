export type MistakeStatus = 'not_attempted' | 'wrong_attempt' | 'unknown';

export function getMistakeStatusLabel(status?: string | null, language: 'zh' | 'en' = 'zh') {
    const labels = language === 'en'
        ? {
            not_attempted: 'Not attempted',
            wrong_attempt: 'Wrong attempt',
            unknown: 'Unknown',
        }
        : {
            not_attempted: '不会做',
            wrong_attempt: '做错了',
            unknown: '未判断',
        };

    if (status === 'not_attempted' || status === 'wrong_attempt' || status === 'unknown') {
        return labels[status];
    }
    return labels.unknown;
}

export function normalizeMistakeStatusForSave(status?: string | null, wrongAnswerText?: string | null, mistakeAnalysis?: string | null): MistakeStatus {
    if ((wrongAnswerText || '').trim() || (mistakeAnalysis || '').trim()) {
        return 'wrong_attempt';
    }
    if (status === 'not_attempted' || status === 'wrong_attempt' || status === 'unknown') {
        return status;
    }
    return 'not_attempted';
}
