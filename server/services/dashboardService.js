import { randomUUID } from "node:crypto";
import { db } from "./databaseService.js";

const createInteractionId = () => `A-${Date.now().toString().slice(-8)}-${randomUUID().slice(0, 6)}`;

const percent = (part, total) => {
  if (!total) return 0;
  return Math.round((part / total) * 100);
};

const queryCount = (sql, params = []) => db.prepare(sql).get(...params).count;

const queryGroupCounts = (sql) =>
  db.prepare(sql).all().map((row) => ({
    name: row.name || "未分类",
    count: row.count,
  }));

export const recordAiInteraction = (result) => {
  db.prepare(
    `INSERT INTO ai_interactions (
      id,
      question,
      category,
      priority,
      source_ids,
      has_knowledge_hit,
      should_create_ticket,
      confidence,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    createInteractionId(),
    result.question,
    result.category || "产品咨询",
    result.priority || "中",
    JSON.stringify((result.sources || []).map((source) => source.id)),
    result.sources?.length > 0 ? 1 : 0,
    result.shouldCreateTicket ? 1 : 0,
    Math.round(result.confidence || 0),
    new Date().toISOString()
  );
};

const getFallbackConsultationCount = () =>
  Math.max(
    queryCount("SELECT COUNT(*) AS count FROM tickets"),
    queryCount("SELECT COUNT(*) AS count FROM customer_feedback")
  );

export const getDashboardStats = () => {
  const interactionCount = queryCount("SELECT COUNT(*) AS count FROM ai_interactions");
  const totalConsultations = interactionCount || getFallbackConsultationCount();
  const knowledgeHitCount = queryCount(
    "SELECT COUNT(*) AS count FROM ai_interactions WHERE has_knowledge_hit = 1"
  );
  const shouldCreateTicketCount = queryCount(
    "SELECT COUNT(*) AS count FROM ai_interactions WHERE should_create_ticket = 1"
  );
  const ticketCount = queryCount("SELECT COUNT(*) AS count FROM tickets");
  const feedbackCount = queryCount("SELECT COUNT(*) AS count FROM customer_feedback");
  const resolvedFeedbackCount = queryCount(
    "SELECT COUNT(*) AS count FROM customer_feedback WHERE feedback = 'resolved'"
  );
  const unresolvedFeedbackCount = queryCount(
    "SELECT COUNT(*) AS count FROM customer_feedback WHERE feedback = 'unresolved'"
  );
  const enabledKnowledgeCount = queryCount(
    "SELECT COUNT(*) AS count FROM knowledge_items WHERE enabled = 1"
  );
  const disabledKnowledgeCount = queryCount(
    "SELECT COUNT(*) AS count FROM knowledge_items WHERE enabled = 0"
  );

  const categoryDistribution = queryGroupCounts(
    `SELECT category AS name, COUNT(*) AS count
     FROM tickets
     GROUP BY category
     ORDER BY count DESC
     LIMIT 6`
  );
  const interactionCategoryDistribution = queryGroupCounts(
    `SELECT category AS name, COUNT(*) AS count
     FROM ai_interactions
     GROUP BY category
     ORDER BY count DESC
     LIMIT 6`
  );

  return {
    metrics: {
      totalConsultations,
      aiResolutionRate: percent(resolvedFeedbackCount, feedbackCount),
      handoffRate: percent(
        interactionCount > 0 ? shouldCreateTicketCount : ticketCount,
        totalConsultations
      ),
      knowledgeHitRate: percent(knowledgeHitCount, interactionCount),
      ticketCount,
      feedbackCount,
      enabledKnowledgeCount,
      disabledKnowledgeCount,
    },
    feedbackDistribution: [
      { name: "已解决", count: resolvedFeedbackCount },
      { name: "仍需帮助", count: unresolvedFeedbackCount },
    ],
    ticketStatusDistribution: queryGroupCounts(
      `SELECT status AS name, COUNT(*) AS count
       FROM tickets
       GROUP BY status
       ORDER BY count DESC`
    ),
    categoryDistribution: interactionCategoryDistribution.length > 0
      ? interactionCategoryDistribution
      : categoryDistribution,
    recentUnresolved: db
      .prepare(
        `SELECT question, feedback, created_at AS createdAt
         FROM customer_feedback
         WHERE feedback = 'unresolved'
         ORDER BY created_at DESC
         LIMIT 5`
      )
      .all(),
    knowledgeStatusDistribution: [
      { name: "启用", count: enabledKnowledgeCount },
      { name: "停用", count: disabledKnowledgeCount },
    ],
  };
};
