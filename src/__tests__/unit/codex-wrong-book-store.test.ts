// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import os from "os";
import { spawnSync } from "child_process";

const repoRoot = process.cwd();
const pythonScript = join(
  repoRoot,
  "codex-skills",
  "cherry-wrong-book",
  "scripts",
  "wrongbook_store.py"
);
const installScript = join(repoRoot, "scripts", "install-codex-wrongbook-skill.js");

const tempDirs: string[] = [];

function makeTempDir(prefix: string) {
  const dir = mkdtempSync(join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function runCommand(
  command: string,
  args: string[],
  extra: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
) {
  const result = spawnSync(command, args, {
    cwd: extra.cwd ?? repoRoot,
    env: { ...process.env, ...extra.env },
    encoding: "utf8",
  });

  return {
    ...result,
    json: result.stdout?.trim() ? JSON.parse(result.stdout.trim()) : null,
  };
}

function writeJson(filePath: string, payload: unknown) {
  writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("cherry wrong book skill install", () => {
  it("copies the skill into CODEX_HOME", () => {
    const fakeCodexHome = makeTempDir("codex-home-");
    const result = runCommand("node", [installScript], {
      env: { CODEX_HOME: fakeCodexHome },
    });

    expect(result.status).toBe(0);
    expect(result.json.status).toBe("installed");
    expect(existsSync(join(fakeCodexHome, "skills", "cherry-wrong-book", "SKILL.md"))).toBe(true);
    expect(existsSync(join(fakeCodexHome, "skills", "cherry-wrong-book", "agents", "openai.yaml"))).toBe(true);
    expect(
      existsSync(join(fakeCodexHome, "skills", "cherry-wrong-book", "scripts", "wrongbook_store.py"))
    ).toBe(true);
  });
});

describe("wrongbook_store.py", () => {
  it("initializes the workspace store and saves a text-only entry", () => {
    const workspace = makeTempDir("wrongbook-workspace-");
    const payloadFile = join(workspace, "payload.json");

    const initResult = runCommand("python", [pythonScript, "init", "--workspace-root", workspace]);
    expect(initResult.status).toBe(0);
    expect(initResult.json.status).toBe("initialized");

    writeJson(payloadFile, {
      input: {
        source_type: "chat_text",
        raw_text: "解方程 x^2 - 5x + 6 = 0",
      },
      draft: {
        subject: "数学",
        question_text: "解方程 $x^2 - 5x + 6 = 0$。",
        answer_text: "$x=2$ 或 $x=3$。",
        analysis: "将方程因式分解为 $(x-2)(x-3)=0$，所以解为 $x=2$ 或 $x=3$。",
        tags: ["一元二次方程", "因式分解"],
        requires_image: false,
      },
      final: {
        subject: "math",
        question_text: "解方程 $x^2 - 5x + 6 = 0$。",
        answer_text: "$x=2$ 或 $x=3$。",
        analysis: "因式分解得 $(x-2)(x-3)=0$，所以方程的解是 $x=2$ 或 $x=3$。",
        tags: ["一元二次方程", "因式分解"],
        requires_image: false,
      },
      notes: "用户确认过最终答案。",
      meta: {
        confirmed_by_user: true,
      },
    });

    const saveResult = runCommand("python", [
      pythonScript,
      "save",
      "--workspace-root",
      workspace,
      "--payload-file",
      payloadFile,
    ]);

    expect(saveResult.status).toBe(0);
    expect(saveResult.json.status).toBe("saved");
    expect(saveResult.json.entry.subject_key).toBe("math");
    expect(saveResult.json.entry.image_path).toBeNull();

    const getResult = runCommand("python", [
      pythonScript,
      "get",
      "--workspace-root",
      workspace,
      "--id",
      saveResult.json.entry.id,
    ]);

    expect(getResult.status).toBe(0);
    expect(getResult.json.entry.final.tags).toEqual(["一元二次方程", "因式分解"]);
    expect(getResult.json.entry.notes).toBe("用户确认过最终答案。");
  });

  it("copies a local image into the workspace archive", () => {
    const workspace = makeTempDir("wrongbook-image-");
    const payloadFile = join(workspace, "payload.json");
    const sourceImage = join(workspace, "source.png");
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZxVkAAAAASUVORK5CYII=";
    writeFileSync(sourceImage, Buffer.from(pngBase64, "base64"));

    writeJson(payloadFile, {
      input: {
        source_type: "local_image_path",
        raw_text: "几何图见图片",
        image_source_path: sourceImage,
      },
      draft: {
        subject: "物理",
        question_text: "如图，求电路中的总电阻。",
        answer_text: "总电阻为 6Ω。",
        analysis: "先串并联化简，再代入数值计算。",
        tags: ["串并联电路"],
        requires_image: true,
      },
      final: {
        subject: "physics",
        question_text: "如图，求电路中的总电阻。",
        answer_text: "总电阻为 6Ω。",
        analysis: "根据电阻串并联关系化简电路后，可得总电阻为 6Ω。",
        tags: ["串并联电路"],
        requires_image: true,
      },
      meta: {
        confirmed_by_user: true,
      },
    });

    const saveResult = runCommand("python", [
      pythonScript,
      "save",
      "--workspace-root",
      workspace,
      "--payload-file",
      payloadFile,
    ]);

    expect(saveResult.status).toBe(0);
    expect(saveResult.json.entry.requires_image).toBe(true);
    expect(saveResult.json.entry.image_path).toMatch(/^data[\\/]+codex-wrong-book[\\/]+images/);

    const archivedPath = join(workspace, saveResult.json.entry.image_path);
    expect(existsSync(archivedPath)).toBe(true);
    expect(readFileSync(archivedPath).length).toBeGreaterThan(0);
  });

  it("accepts thread attachments without forcing a local image path", () => {
    const workspace = makeTempDir("wrongbook-thread-");
    const payloadFile = join(workspace, "payload.json");

    writeJson(payloadFile, {
      input: {
        source_type: "thread_attachment",
        raw_text: "用户直接上传了聊天图片，没有给本机路径",
      },
      final: {
        subject: "数学",
        question_text: "如图，已知抛物线经过 A、B 两点，求解析式。",
        answer_text: "设抛物线解析式后代入两点坐标即可求出。",
        analysis: "本题依赖图像信息，所以需要保留 requires_image=true。",
        tags: ["二次函数"],
        requires_image: true,
      },
      meta: {
        confirmed_by_user: true,
      },
    });

    const saveResult = runCommand("python", [
      pythonScript,
      "save",
      "--workspace-root",
      workspace,
      "--payload-file",
      payloadFile,
    ]);

    expect(saveResult.status).toBe(0);
    expect(saveResult.json.entry.image_path).toBeNull();

    const getResult = runCommand("python", [
      pythonScript,
      "get",
      "--workspace-root",
      workspace,
      "--id",
      saveResult.json.entry.id,
    ]);

    expect(getResult.status).toBe(0);
    expect(getResult.json.entry.source_type).toBe("thread_attachment");
    expect(getResult.json.entry.input.image_source_path).toBeNull();
  });

  it("warns on duplicates unless allow-duplicate is passed", () => {
    const workspace = makeTempDir("wrongbook-dup-");
    const payloadFile = join(workspace, "payload.json");

    writeJson(payloadFile, {
      input: {
        source_type: "chat_text",
        raw_text: "同一道题",
      },
      final: {
        subject: "数学",
        question_text: "计算 $(2+3)^2$。",
        answer_text: "25",
        analysis: "先算括号内得到 5，再平方得到 25。",
        tags: ["整式运算"],
        requires_image: false,
      },
      meta: {
        confirmed_by_user: true,
      },
    });

    const firstSave = runCommand("python", [
      pythonScript,
      "save",
      "--workspace-root",
      workspace,
      "--payload-file",
      payloadFile,
    ]);
    expect(firstSave.status).toBe(0);

    const duplicateSave = runCommand("python", [
      pythonScript,
      "save",
      "--workspace-root",
      workspace,
      "--payload-file",
      payloadFile,
    ]);
    expect(duplicateSave.status).toBe(20);
    expect(duplicateSave.json.status).toBe("duplicate");
    expect(duplicateSave.json.existing.id).toBe(firstSave.json.entry.id);

    const forcedSave = runCommand("python", [
      pythonScript,
      "save",
      "--workspace-root",
      workspace,
      "--payload-file",
      payloadFile,
      "--allow-duplicate",
    ]);
    expect(forcedSave.status).toBe(0);
    expect(forcedSave.json.entry.id).not.toBe(firstSave.json.entry.id);

    const listResult = runCommand("python", [
      pythonScript,
      "list",
      "--workspace-root",
      workspace,
      "--summary",
      "--limit",
      "10",
    ]);
    expect(listResult.status).toBe(0);
    expect(listResult.json.entries).toHaveLength(2);
  });
});
