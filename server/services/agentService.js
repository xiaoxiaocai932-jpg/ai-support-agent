import { retrieveKnowledge } from "./retrievalService.js";
import { generateCustomerAnswer } from "./llmService.js";

const highRiskTerms = ["付款", "发票", "合同", "权限", "停用", "故障", "无法同步", "生产环境"];

const categoryRules = [
  { category: "账号与权限", department: "客户成功团队", terms: ["账号", "权限", "子账号", "登录", "密码"] },
  { category: "计费与合同", department: "财务支持团队", terms: ["发票", "合同", "付款", "计费"] },
  { category: "系统故障", department: "技术支持团队", terms: ["同步", "故障", "接口", "报错", "数据"] },
  { category: "系统集成", department: "解决方案团队", terms: ["集成", "飞书", "企业微信", "Webhook", "回调"] },
];

const departmentByCategory = new Map(
  categoryRules.map((rule) => [rule.category, rule.department])
);

const inferRouting = (question, sources) => {
  const primarySource = sources[0];
  const text = question;
  const matchedRule = categoryRules.find((rule) =>
    rule.terms.some((term) => text.includes(term))
  );
  const hasHighRisk = highRiskTerms.some((term) => text.includes(term));
  const category = primarySource?.category || matchedRule?.category || "产品咨询";

  return {
    category,
    department: departmentByCategory.get(category) || matchedRule?.department || "客服支持团队",
    priority: hasHighRisk ? "高" : "中",
  };
};

const buildAnswer = (question, sources) => {
  if (sources.length === 0) {
    return "当前知识库没有找到足够相关的内容。建议提交工单，由人工支持团队进一步确认。";
  }

  const primary = sources[0];

  return [
    `根据《${primary.title}》，建议先按以下信息处理：`,
    primary.content,
    "如果你的实际情况和上述说明不一致，可以生成工单让支持团队继续跟进。",
  ].join("\n\n");
};

export const askAgent = async (question) => {
  const sources = retrieveKnowledge(question);
  const routing = inferRouting(question, sources);
  const confidence = Math.min(92, 42 + sources.reduce((sum, source) => sum + source.score, 0) * 8);
  const shouldCreateTicket = sources.length === 0 || confidence < 68 || routing.priority === "高";
  const fallbackAnswer = buildAnswer(question, sources);
  let answer = fallbackAnswer;
  let answerMode = "rule_fallback";

  try {
    const llmAnswer = await generateCustomerAnswer({ question, sources });

    if (llmAnswer) {
      answer = llmAnswer;
      answerMode = "seed_2_0_pro";
    }
  } catch (error) {
    console.warn(error.message);
  }

  return {
    question,
    answer,
    answerMode,
    confidence,
    shouldCreateTicket,
    category: routing.category,
    priority: routing.priority,
    department: routing.department,
    sources: sources.map(({ id, title, category, content, score }) => ({
      id,
      title,
      category,
      snippet: content,
      score,
    })),
  };
};
