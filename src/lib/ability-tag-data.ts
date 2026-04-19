export type AbilitySubject =
    | 'math'
    | 'physics'
    | 'chemistry'
    | 'biology'
    | 'english'
    | 'chinese'
    | 'history'
    | 'geography'
    | 'politics'
    | 'other';

export interface AbilityTagDefinition {
    code: string;
    name: string;
    subject: AbilitySubject;
    description: string;
    order: number;
}

export const MATH_ABILITY_TAGS: AbilityTagDefinition[] = [
    { code: 'math.ability.01', name: '审题理解', subject: 'math', description: '没有准确读懂题目的显性要求、限制条件或提问目标。', order: 1 },
    { code: 'math.ability.02', name: '条件提取与隐含条件', subject: 'math', description: '不能提炼有效条件，或忽略题中未明说但客观存在的限制。', order: 2 },
    { code: 'math.ability.03', name: '图文转换', subject: 'math', description: '不能在文字、图形、表格、式子之间完成有效转换。', order: 3 },
    { code: 'math.ability.04', name: '单位与量纲意识', subject: 'math', description: '对单位、数量属性和量纲匹配缺少敏感性。', order: 4 },
    { code: 'math.ability.05', name: '数感与估算', subject: 'math', description: '对数的大小、范围、规律和结果合理性缺少直觉。', order: 5 },
    { code: 'math.ability.06', name: '概念辨析', subject: 'math', description: '对定义、性质、公式适用条件理解不清。', order: 6 },
    { code: 'math.ability.07', name: '计算准确性', subject: 'math', description: '思路基本正确，但基础运算过程中出现错误。', order: 7 },
    { code: 'math.ability.08', name: '运算规则与变形', subject: 'math', description: '不能稳定、规范地进行代数变形或规则处理。', order: 8 },
    { code: 'math.ability.09', name: '数量关系识别', subject: 'math', description: '看不出数量之间的核心关系。', order: 9 },
    { code: 'math.ability.10', name: '建模与情境翻译', subject: 'math', description: '不能把实际情境抽象成数学模型。', order: 10 },
    { code: 'math.ability.11', name: '代数与变量思维', subject: 'math', description: '不能自然使用字母、变量和一般关系。', order: 11 },
    { code: 'math.ability.12', name: '规律归纳与递推', subject: 'math', description: '不能从特例中发现结构、规律或递推关系。', order: 12 },
    { code: 'math.ability.13', name: '分类讨论', subject: 'math', description: '面对多种可能时不能完整、互斥、无遗漏地分情况处理。', order: 13 },
    { code: 'math.ability.14', name: '边界与特殊情况', subject: 'math', description: '忽略临界点、端点、极端值、整数约束或特殊退化情形。', order: 14 },
    { code: 'math.ability.15', name: '转化与化归', subject: 'math', description: '不能把陌生题型转化为熟悉问题。', order: 15 },
    { code: 'math.ability.16', name: '逆向推导', subject: 'math', description: '顺推卡住后，不会从目标出发反推所需条件。', order: 16 },
    { code: 'math.ability.17', name: '图形拆解与组合', subject: 'math', description: '面对复杂图形时，不能识别基本图形构成或合理分割拼接。', order: 17 },
    { code: 'math.ability.18', name: '辅助线构建', subject: 'math', description: '几何解题中不会通过辅助线创造关系。', order: 18 },
    { code: 'math.ability.19', name: '空间与动态想象', subject: 'math', description: '对平移、旋转、翻折、展开、动点变化等缺乏脑内模拟能力。', order: 19 },
    { code: 'math.ability.20', name: '逻辑推理与表达', subject: 'math', description: '不能有条理地推出结论，或表达不规范。', order: 20 },
    { code: 'math.ability.21', name: '策略选择', subject: 'math', description: '不会判断题目更适合用哪种方法切入。', order: 21 },
    { code: 'math.ability.22', name: '思维定势', subject: 'math', description: '被熟悉题型带偏，没有意识到条件或问法已变化。', order: 22 },
    { code: 'math.ability.23', name: '检验与反思', subject: 'math', description: '缺少回头检查、验证结果和复盘错因的习惯。', order: 23 },
];

export const SYSTEM_ABILITY_TAGS: AbilityTagDefinition[] = [
    ...MATH_ABILITY_TAGS,
];

export const ABILITY_SUBJECTS: AbilitySubject[] = [
    'math',
    'physics',
    'chemistry',
    'biology',
    'english',
    'chinese',
    'history',
    'geography',
    'politics',
    'other',
];
