"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BrainCircuit, Loader2, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { apiClient } from "@/lib/api-client";
import { cleanMarkdown } from "@/lib/markdown-utils";
import { getMistakeStatusLabel } from "@/lib/mistake-status";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { AbilityTagsResponse, ErrorItem, Notebook, PaginatedResponse } from "@/types/api";
import { useLanguage } from "@/contexts/LanguageContext";

interface AnalyzeItemResult {
    id: string;
    generatedTags: string[];
    libraryTags: string[];
    finalTags: string[];
    status: "updated" | "skipped" | "no_result";
    reason?: string;
}

interface AnalyzeResponse {
    selected: number;
    processed: number;
    updated: number;
    skipped: number;
    noResult: number;
    invalidTags: number;
    createdGeneratedTags: number;
    batchSummary?: string;
    commonPatterns?: string[];
    message?: string;
    items: AnalyzeItemResult[];
}

const LARGE_SELECTION_COUNT = 80;
const LARGE_TEXT_LENGTH = 300_000;

function getItemTextLength(item: ErrorItem) {
    return [
        item.questionText,
        item.answerText,
        item.analysis,
        item.wrongAnswerText,
        item.mistakeAnalysis,
        item.knowledgePoints,
    ].reduce((sum, value) => sum + (value || "").length, 0);
}

function getKnowledgePoints(item: ErrorItem) {
    if (item.tags && item.tags.length > 0) return item.tags.map(tag => tag.name);
    try {
        const parsed = JSON.parse(item.knowledgePoints || "[]");
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

export default function AbilityTagsPage() {
    const { t, language } = useLanguage();
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [items, setItems] = useState<ErrorItem[]>([]);
    const [subjectId, setSubjectId] = useState("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [availableTagCount, setAvailableTagCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedItemMap, setSelectedItemMap] = useState<Map<string, ErrorItem>>(new Map());
    const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);
    const [lastMessage, setLastMessage] = useState("");

    const pageSize = DEFAULT_PAGE_SIZE;

    const selectedTextLength = useMemo(() => {
        return Array.from(selectedItemMap.values()).reduce((sum, item) => sum + getItemTextLength(item), 0);
    }, [selectedItemMap]);

    const currentPageSelected = items.length > 0 && items.every(item => selectedIds.has(item.id));

    const loadNotebooksAndTags = async () => {
        const [notebookData, tagData] = await Promise.all([
            apiClient.get<Notebook[]>("/api/notebooks"),
            apiClient.get<AbilityTagsResponse>("/api/ability-tags"),
        ]);
        setNotebooks(notebookData);
        setAvailableTagCount(tagData.tags.length);
    };

    const loadItems = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(page),
                pageSize: String(pageSize),
            });
            if (subjectId !== "all") params.append("subjectId", subjectId);
            if (search.trim()) params.append("query", search.trim());

            const data = await apiClient.get<PaginatedResponse<ErrorItem>>(`/api/error-items/list?${params.toString()}`);
            setItems(data.items);
            setTotal(data.total);
            setTotalPages(data.totalPages || 1);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadNotebooksAndTags().catch(err => console.error(err));
    }, []);

    useEffect(() => {
        loadItems().catch(err => console.error(err));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, subjectId]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            loadItems().catch(err => console.error(err));
        }, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const toggleItem = (item: ErrorItem) => {
        const willSelect = !selectedIds.has(item.id);
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (willSelect) next.add(item.id);
            else next.delete(item.id);
            return next;
        });
        setSelectedItemMap(prev => {
            const next = new Map(prev);
            if (willSelect) next.set(item.id, item);
            else next.delete(item.id);
            return next;
        });
    };

    const toggleCurrentPage = () => {
        if (currentPageSelected) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                items.forEach(item => next.delete(item.id));
                return next;
            });
            setSelectedItemMap(prev => {
                const next = new Map(prev);
                items.forEach(item => next.delete(item.id));
                return next;
            });
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                items.forEach(item => next.add(item.id));
                return next;
            });
            setSelectedItemMap(prev => {
                const next = new Map(prev);
                items.forEach(item => next.set(item.id, item));
                return next;
            });
        }
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
        setSelectedItemMap(new Map());
        setAnalysisResult(null);
    };

    const runAnalysis = async () => {
        if (selectedIds.size === 0) return;

        if (selectedIds.size > LARGE_SELECTION_COUNT || selectedTextLength > LARGE_TEXT_LENGTH) {
            const confirmed = confirm(
                `本次选择了 ${selectedIds.size} 道题，估算文本长度约 ${selectedTextLength.toLocaleString()} 字符。\n` +
                "这可能超过部分模型上下文或等待较久。是否仍然一次发送分析？"
            );
            if (!confirmed) return;
        }

        setRunning(true);
        setLastMessage("");
        setAnalysisResult(null);

        try {
            const result = await apiClient.post<AnalyzeResponse>("/api/ability-tags/analyze", {
                errorItemIds: Array.from(selectedIds),
            }, { timeout: 600000 });

            setAnalysisResult(result);
            setLastMessage(result.message || "能力标签分析完成，结果已自动保存");
            await loadItems();
            await loadNotebooksAndTags();
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.updateFailed || "分析失败");
        } finally {
            setRunning(false);
        }
    };

    const resultById = useMemo(() => {
        const map = new Map<string, AnalyzeItemResult>();
        for (const item of analysisResult?.items || []) map.set(item.id, item);
        return map;
    }, [analysisResult]);

    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto p-4 space-y-6 pb-24">
                <div className="flex items-center gap-4">
                    <Link href="/">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <BrainCircuit className="h-6 w-6" />
                            {t.abilityTags?.title || "抽象能力标签"}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            选择一组错题，让 AI 先整体诊断共性薄弱点，再自动关联到每道题
                        </p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>选择要整体分析的错题</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>{t.editor?.selectNotebook || "选择错题本"}</Label>
                                <Select value={subjectId} onValueChange={(value) => { setSubjectId(value); setPage(1); }} disabled={running}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t.filter?.all || "全部"}</SelectItem>
                                        {notebooks.map(notebook => (
                                            <SelectItem key={notebook.id} value={notebook.id}>
                                                {notebook.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>搜索题目 / 解析 / 标签</Label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="输入关键词筛选错题"
                                        className="pl-9"
                                        disabled={running}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Badge variant="secondary">当前筛选结果：{loading ? "..." : total} 道</Badge>
                            <Badge variant="secondary">已选择：{selectedIds.size} 道</Badge>
                            <Badge variant="outline">可用能力标签：{availableTagCount}</Badge>
                            <Badge variant="outline">估算文本：{selectedTextLength.toLocaleString()} 字符</Badge>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={toggleCurrentPage} disabled={running || items.length === 0}>
                                {currentPageSelected ? "取消本页全选" : "全选当前页"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={clearSelection} disabled={running || selectedIds.size === 0}>
                                <X className="h-4 w-4 mr-1" />
                                清空选择
                            </Button>
                            <Button onClick={runAnalysis} disabled={running || selectedIds.size === 0}>
                                {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BrainCircuit className="h-4 w-4 mr-2" />}
                                {running ? "整体分析中，请等待..." : "分析选中题目并自动保存"}
                            </Button>
                            <Button variant="outline" onClick={loadItems} disabled={running}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                {t.common?.refresh || "刷新"}
                            </Button>
                        </div>

                        {running && (
                            <p className="text-sm text-muted-foreground">
                                正在把 {selectedIds.size} 道题作为一个整体请求发送给 AI。请不要重复点击，最长可能等待数分钟。
                            </p>
                        )}

                        {lastMessage && (
                            <p className="text-sm text-muted-foreground">{lastMessage}</p>
                        )}
                    </CardContent>
                </Card>

                {analysisResult && (
                    <Card>
                        <CardHeader>
                            <CardTitle>本次分析结果</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="secondary">选中 {analysisResult.selected}</Badge>
                                <Badge variant="secondary">成功更新 {analysisResult.updated}</Badge>
                                <Badge variant="outline">跳过 {analysisResult.skipped}</Badge>
                                <Badge variant="outline">无返回 {analysisResult.noResult}</Badge>
                                <Badge variant="outline">忽略无效库内标签 {analysisResult.invalidTags}</Badge>
                                <Badge variant="outline">新建自主标签 {analysisResult.createdGeneratedTags}</Badge>
                            </div>
                            {analysisResult.batchSummary && (
                                <p className="text-sm leading-6 whitespace-pre-wrap">{analysisResult.batchSummary}</p>
                            )}
                            {(analysisResult.commonPatterns || []).length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold">共性薄弱点</h3>
                                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                        {analysisResult.commonPatterns?.map((pattern, index) => (
                                            <li key={`${pattern}-${index}`}>{pattern}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle>错题列表</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-10 text-muted-foreground">
                                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                加载中...
                            </div>
                        ) : items.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-10 text-center">没有符合条件的错题</p>
                        ) : (
                            <div className="space-y-3">
                                {items.map(item => {
                                    const abilityTags = (item.abilityTagLinks || []).map(link => link.abilityTag.name);
                                    const knowledgePoints = getKnowledgePoints(item);
                                    const selected = selectedIds.has(item.id);
                                    const result = resultById.get(item.id);

                                    return (
                                        <div
                                            key={item.id}
                                            className={`border rounded-lg p-4 cursor-pointer transition-colors ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                                            onClick={() => toggleItem(item)}
                                        >
                                            <div className="flex items-start gap-3">
                                                <Checkbox checked={selected} className="mt-1" />
                                                <div className="flex-1 min-w-0 space-y-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Badge variant="secondary">{item.subject?.name || '未分类'}</Badge>
                                                        {item.gradeSemester && <Badge variant="outline">{item.gradeSemester}</Badge>}
                                                        <Badge variant="outline">{getMistakeStatusLabel(item.mistakeStatus, language)}</Badge>
                                                        {result && (
                                                            <Badge variant={result.status === 'updated' ? 'default' : 'outline'}>
                                                                {result.status === 'updated' ? '本次已更新' : result.status === 'no_result' ? '本次无返回' : '本次跳过'}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="font-medium line-clamp-2">
                                                        {cleanMarkdown(item.questionText || '无题目文本')}
                                                    </p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {knowledgePoints.slice(0, 4).map(tag => (
                                                            <Badge key={`k-${item.id}-${tag}`} variant="outline" className="text-xs">
                                                                {tag}
                                                            </Badge>
                                                        ))}
                                                        {abilityTags.slice(0, 4).map(tag => (
                                                            <Badge key={`a-${item.id}-${tag}`} variant="secondary" className="text-xs border-dashed">
                                                                {tag}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                    {result && result.finalTags.length > 0 && (
                                                        <div className="text-xs text-muted-foreground">
                                                            本次标签：{result.finalTags.join('、')}
                                                            {result.reason ? `｜${result.reason}` : ''}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <Pagination
                            page={page}
                            totalPages={totalPages}
                            total={total}
                            pageSize={pageSize}
                            onPageChange={setPage}
                        />
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
