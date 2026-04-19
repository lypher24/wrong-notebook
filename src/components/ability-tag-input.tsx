"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { AbilityTagSuggestionsResponse } from "@/types/api";

interface AbilityTagInputProps {
    value: string[];
    onChange: (tags: string[]) => void;
    subject?: string;
    placeholder?: string;
    className?: string;
}

export function AbilityTagInput({ value = [], onChange, subject, placeholder = "输入能力标签...", className = "" }: AbilityTagInputProps) {
    const [input, setInput] = useState("");
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchSuggestions = async () => {
            if (!input.trim()) {
                setSuggestions([]);
                setShowSuggestions(false);
                return;
            }

            const params = new URLSearchParams({ q: input.trim() });
            if (subject) params.append("subject", subject);
            const data = await apiClient.get<AbilityTagSuggestionsResponse>(`/api/ability-tags/suggestions?${params.toString()}`);
            const filtered = (data.suggestions || []).filter(tag => !value.includes(tag));
            setSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
            setSelectedIndex(0);
        };

        fetchSuggestions().catch(err => console.error("Failed to fetch ability tag suggestions:", err));
    }, [input, subject, value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                suggestionsRef.current &&
                !suggestionsRef.current.contains(event.target as Node) &&
                !inputRef.current?.contains(event.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const addTag = (tag: string) => {
        const clean = tag.trim();
        if (!clean || value.includes(clean) || value.length >= 4) return;
        onChange([...value, clean]);
        setInput("");
        setSuggestions([]);
        setShowSuggestions(false);
        setSelectedIndex(0);
    };

    const removeTag = (tagToRemove: string) => {
        onChange(value.filter(tag => tag !== tagToRemove));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (selectedIndex >= 0 && suggestions[selectedIndex]) {
                addTag(suggestions[selectedIndex]);
            } else {
                addTag(input);
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === "Backspace" && !input && value.length > 0) {
            removeTag(value[value.length - 1]);
        }
    };

    return (
        <div className={`relative ${className}`}>
            <div className="flex flex-wrap gap-2 p-2 border rounded-lg bg-background min-h-[42px]">
                {value.map(tag => (
                    <Badge key={tag} variant="secondary" className="flex items-center gap-1 px-2 py-1">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive ml-1">
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                ))}

                <Input
                    ref={inputRef}
                    type="text"
                    value={input}
                    disabled={value.length >= 4}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    placeholder={value.length === 0 ? placeholder : value.length >= 4 ? "最多 4 个标签" : ""}
                    className="flex-1 min-w-[120px] border-none focus-visible:ring-0 focus-visible:ring-offset-0 h-8 px-0"
                />
            </div>

            {showSuggestions && suggestions.length > 0 && (
                <div
                    ref={suggestionsRef}
                    className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto"
                >
                    {suggestions.map((suggestion, index) => (
                        <div
                            key={suggestion}
                            className={`px-3 py-2 cursor-pointer hover:bg-accent ${index === selectedIndex ? "bg-accent" : ""}`}
                            onClick={() => addTag(suggestion)}
                            onMouseEnter={() => setSelectedIndex(index)}
                        >
                            {suggestion}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
