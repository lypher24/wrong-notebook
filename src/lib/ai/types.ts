// Re-export the Zod-validated type from schema.ts
export type { ParsedQuestionFromSchema as ParsedQuestion } from './schema';
import type { ParsedQuestionFromSchema } from './schema';

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'harder';
export type MistakeStatus = 'not_attempted' | 'wrong_attempt' | 'unknown';

export interface AbilityAnalysisItemInput {
    id: string;
    subject?: string | null;
    questionText?: string | null;
    answerText?: string | null;
    analysis?: string | null;
    knowledgePoints?: string[];
    wrongAnswerText?: string | null;
    mistakeAnalysis?: string | null;
    mistakeStatus?: MistakeStatus | string | null;
}

export interface AbilityTagCandidate {
    name: string;
    subject: string;
    description?: string | null;
}

export interface AbilityAnalysisResult {
    errorItemId: string;
    tags: string[];
    reason?: string;
}

export interface AIService {
    analyzeImage(imageBase64: string, mimeType?: string, language?: 'zh' | 'en', grade?: 7 | 8 | 9 | 10 | 11 | 12 | null, subject?: string | null): Promise<ParsedQuestionFromSchema>;
    generateSimilarQuestion(originalQuestion: string, knowledgePoints: string[], language?: 'zh' | 'en', difficulty?: DifficultyLevel): Promise<ParsedQuestionFromSchema>;
    reanswerQuestion(questionText: string, language?: 'zh' | 'en', subject?: string | null, imageBase64?: string): Promise<{ answerText: string; analysis: string; knowledgePoints: string[] }>;
    analyzeAbilityTags(items: AbilityAnalysisItemInput[], availableTags: AbilityTagCandidate[], overallSummary?: string, language?: 'zh' | 'en'): Promise<AbilityAnalysisResult[]>;
}

export interface AIConfig {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    // Azure OpenAI 特有字段
    azureDeployment?: string;   // Azure 部署名称
    azureApiVersion?: string;   // API 版本 (如 2024-02-15-preview)
}
