-- Add mistake-analysis fields to existing wrong-answer records.
ALTER TABLE "ErrorItem" ADD COLUMN "wrongAnswerText" TEXT;
ALTER TABLE "ErrorItem" ADD COLUMN "mistakeAnalysis" TEXT;
ALTER TABLE "ErrorItem" ADD COLUMN "mistakeStatus" TEXT;

-- Abstract ability tags are intentionally separate from KnowledgeTag.
CREATE TABLE "AbilityTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "code" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AbilityTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ErrorItemAbilityTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "errorItemId" TEXT NOT NULL,
    "abilityTagId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErrorItemAbilityTag_errorItemId_fkey" FOREIGN KEY ("errorItemId") REFERENCES "ErrorItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ErrorItemAbilityTag_abilityTagId_fkey" FOREIGN KEY ("abilityTagId") REFERENCES "AbilityTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AbilityTag_code_key" ON "AbilityTag"("code");
CREATE INDEX "AbilityTag_subject_idx" ON "AbilityTag"("subject");
CREATE INDEX "AbilityTag_userId_idx" ON "AbilityTag"("userId");
CREATE UNIQUE INDEX "ErrorItemAbilityTag_errorItemId_abilityTagId_key" ON "ErrorItemAbilityTag"("errorItemId", "abilityTagId");
CREATE INDEX "ErrorItemAbilityTag_abilityTagId_idx" ON "ErrorItemAbilityTag"("abilityTagId");
CREATE INDEX "ErrorItemAbilityTag_source_idx" ON "ErrorItemAbilityTag"("source");

INSERT OR IGNORE INTO "AbilityTag" ("id", "name", "subject", "description", "order", "code", "isSystem", "createdAt", "updatedAt") VALUES
('ability_math_01', '审题理解', 'math', '没有准确读懂题目的显性要求、限制条件或提问目标。', 1, 'math.ability.01', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_02', '条件提取与隐含条件', 'math', '不能提炼有效条件，或忽略题中未明说但客观存在的限制。', 2, 'math.ability.02', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_03', '图文转换', 'math', '不能在文字、图形、表格、式子之间完成有效转换。', 3, 'math.ability.03', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_04', '单位与量纲意识', 'math', '对单位、数量属性和量纲匹配缺少敏感性。', 4, 'math.ability.04', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_05', '数感与估算', 'math', '对数的大小、范围、规律和结果合理性缺少直觉。', 5, 'math.ability.05', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_06', '概念辨析', 'math', '对定义、性质、公式适用条件理解不清。', 6, 'math.ability.06', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_07', '计算准确性', 'math', '思路基本正确，但基础运算过程中出现错误。', 7, 'math.ability.07', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_08', '运算规则与变形', 'math', '不能稳定、规范地进行代数变形或规则处理。', 8, 'math.ability.08', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_09', '数量关系识别', 'math', '看不出数量之间的核心关系。', 9, 'math.ability.09', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_10', '建模与情境翻译', 'math', '不能把实际情境抽象成数学模型。', 10, 'math.ability.10', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_11', '代数与变量思维', 'math', '不能自然使用字母、变量和一般关系。', 11, 'math.ability.11', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_12', '规律归纳与递推', 'math', '不能从特例中发现结构、规律或递推关系。', 12, 'math.ability.12', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_13', '分类讨论', 'math', '面对多种可能时不能完整、互斥、无遗漏地分情况处理。', 13, 'math.ability.13', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_14', '边界与特殊情况', 'math', '忽略临界点、端点、极端值、整数约束或特殊退化情形。', 14, 'math.ability.14', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_15', '转化与化归', 'math', '不能把陌生题型转化为熟悉问题。', 15, 'math.ability.15', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_16', '逆向推导', 'math', '顺推卡住后，不会从目标出发反推所需条件。', 16, 'math.ability.16', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_17', '图形拆解与组合', 'math', '面对复杂图形时，不能识别基本图形构成或合理分割拼接。', 17, 'math.ability.17', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_18', '辅助线构建', 'math', '几何解题中不会通过辅助线创造关系。', 18, 'math.ability.18', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_19', '空间与动态想象', 'math', '对平移、旋转、翻折、展开、动点变化等缺乏脑内模拟能力。', 19, 'math.ability.19', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_20', '逻辑推理与表达', 'math', '不能有条理地推出结论，或表达不规范。', 20, 'math.ability.20', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_21', '策略选择', 'math', '不会判断题目更适合用哪种方法切入。', 21, 'math.ability.21', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_22', '思维定势', 'math', '被熟悉题型带偏，没有意识到条件或问法已变化。', 22, 'math.ability.22', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ability_math_23', '检验与反思', 'math', '缺少回头检查、验证结果和复盘错因的习惯。', 23, 'math.ability.23', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
