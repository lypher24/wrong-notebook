"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BrainCircuit, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";
import { Notebook } from "@/types/api";
import { useLanguage } from "@/contexts/LanguageContext";

interface CandidatesResponse {
    count: number;
    totalCandidates: number;
    availableTagCount: number;
    message?: string;
}

interface AnalyzeResponse {
    processed: number;
    updated: number;
    remaining: number;
    nextOffset: number;
    message?: string;
    items: { id: string; tags: string[] }[];
}

export default function AbilityTagsPage() {
    const { t } = useLanguage();
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [subjectId, setSubjectId] = useState("all");
    const [onlyUnclassified, setOnlyUnclassified] = useState(true);
    const [candidateInfo, setCandidateInfo] = useState<CandidatesResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [processed, setProcessed] = useState(0);
    const [updated, setUpdated] = useState(0);
    const [lastMessage, setLastMessage] = useState("");

    const loadData = async () => {
        setLoading(true);
        try {
            const [notebookData] = await Promise.all([
                apiClient.get<Notebook[]>("/api/notebooks"),
            ]);
            setNotebooks(notebookData);
            await loadCandidates();
        } finally {
            setLoading(false);
        }
    };

    const loadCandidates = async () => {
        const params = new URLSearchParams({
            onlyUnclassified: String(onlyUnclassified),
        });
        if (subjectId !== "all") params.append("subjectId", subjectId);
        const data = await apiClient.get<CandidatesResponse>(`/api/ability-tags/candidates?${params.toString()}`);
        setCandidateInfo(data);
        if (data.message) setLastMessage(data.message);
    };

    useEffect(() => {
        loadData().catch(err => {
            console.error(err);
            setLoading(false);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        loadCandidates().catch(err => console.error(err));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subjectId, onlyUnclassified]);

    const runAnalysis = async () => {
        if (!candidateInfo || candidateInfo.count === 0) return;

        setRunning(true);
        setProcessed(0);
        setUpdated(0);
        setLastMessage("");

        let remaining = candidateInfo.count;
        let offset = 0;
        let rounds = 0;
        let totalProcessed = 0;
        let totalUpdated = 0;

        try {
            while (remaining > 0 && rounds < 100) {
                rounds++;
                const result = await apiClient.post<AnalyzeResponse>("/api/ability-tags/analyze", {
                    subjectId: subjectId === "all" ? undefined : subjectId,
                    onlyUnclassified,
                    batchSize: 8,
                    offset,
                }, { timeout: 180000 });

                if (result.message) {
                    setLastMessage(result.message);
                    break;
                }

                totalProcessed += result.processed;
                totalUpdated += result.updated;
                setProcessed(totalProcessed);
                setUpdated(totalUpdated);
                remaining = result.remaining;
                offset = result.nextOffset || 0;

                if (result.processed === 0) break;
            }

            await loadCandidates();
            setLastMessage(lastMessage || "能力标签分析完成");
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.updateFailed || "分析失败");
        } finally {
            setRunning(false);
        }
    };

    const total = candidateInfo?.count || 0;
    const progressValue = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto p-4 space-y-6 pb-20">
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
                            {t.abilityTags?.subtitle || "批量分析错题，归纳能力薄弱点"}
                        </p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>{t.abilityTags?.batchTitle || "批量分析"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>{t.editor?.selectNotebook || "选择错题本"}</Label>
                                <Select value={subjectId} onValueChange={setSubjectId} disabled={running}>
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
                                <Label>{t.abilityTags?.mode || "分析范围"}</Label>
                                <div className="flex items-center justify-between border rounded-md px-3 py-2">
                                    <span className="text-sm">
                                        {t.abilityTags?.onlyUnclassified || "仅分析未分类题目"}
                                    </span>
                                    <Switch
                                        checked={onlyUnclassified}
                                        onCheckedChange={setOnlyUnclassified}
                                        disabled={running}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Badge variant="secondary">
                                {t.abilityTags?.pendingCount || "待分析"}：{loading ? "..." : candidateInfo?.count || 0}
                            </Badge>
                            <Badge variant="outline">
                                {t.abilityTags?.availableTags || "可用标签"}：{candidateInfo?.availableTagCount || 0}
                            </Badge>
                        </div>

                        {running && (
                            <div className="space-y-2">
                                <Progress value={progressValue} />
                                <p className="text-sm text-muted-foreground">
                                    已处理 {processed} / {total}，已更新 {updated} 道
                                </p>
                            </div>
                        )}

                        {lastMessage && (
                            <p className="text-sm text-muted-foreground">{lastMessage}</p>
                        )}

                        <div className="flex gap-2">
                            <Button onClick={runAnalysis} disabled={running || loading || total === 0}>
                                {running ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <BrainCircuit className="h-4 w-4 mr-2" />
                                )}
                                {running ? (t.abilityTags?.running || "分析中...") : (t.abilityTags?.run || "开始分析")}
                            </Button>
                            <Button variant="outline" onClick={loadCandidates} disabled={running}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                {t.common?.refresh || "刷新"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
