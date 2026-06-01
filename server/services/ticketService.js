import { db } from "./databaseService.js";
import { getKnowledgeByIds } from "./knowledgeService.js";
import { generateSupportReplyDraft } from "./llmService.js";
import { randomUUID } from "node:crypto";

const ticketStatuses = ["待处理", "处理中", "待客户确认", "已解决", "已关闭"];
const customerFeedbackValues = ["resolved", "unresolved"];

const getAllowedNextStatuses = (ticket) => {
  const hasReplies = ticket.replies?.length > 0;

  if (ticket.status === "待处理") {
    return hasReplies ? ["处理中", "待客户确认"] : ["处理中"];
  }

  if (ticket.status === "处理中") {
    return hasReplies ? ["待客户确认", "已解决"] : [];
  }

  if (ticket.status === "待客户确认") {
    return ticket.customerFeedback === "resolved" ? ["已解决"] : ["处理中"];
  }

  if (ticket.status === "已解决") {
    return ["已关闭", "处理中"];
  }

  return [];
};

const createTicketId = () => `T-${Date.now().toString().slice(-8)}-${randomUUID().slice(0, 6)}`;
const createReplyId = () => `R-${Date.now().toString().slice(-8)}-${randomUUID().slice(0, 6)}`;
const createFollowupId = () => `C-${Date.now().toString().slice(-8)}-${randomUUID().slice(0, 6)}`;
const createFeedbackId = () => `F-${Date.now().toString().slice(-8)}-${randomUUID().slice(0, 6)}`;

const getSourcesByIds = (sourceIds) =>
  getKnowledgeByIds(sourceIds).map(({ id, title, category, content }) => ({
    id,
    title,
    category,
    content,
  }));

const parseSourceIds = (value) => {
  try {
    const parsedValue = JSON.parse(value || "[]");
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
};

const getRepliesByTicketId = (ticketId) =>
  db
    .prepare(
      `SELECT id, author, content, created_at AS createdAt
       FROM ticket_replies
       WHERE ticket_id = ?
       ORDER BY created_at ASC`
    )
    .all(ticketId);

const getFollowupsByTicketId = (ticketId) =>
  db
    .prepare(
      `SELECT id, author, content, created_at AS createdAt
       FROM ticket_followups
       WHERE ticket_id = ?
       ORDER BY created_at ASC`
    )
    .all(ticketId);

const mapTicketRow = (row) => {
  if (!row) return null;

  const sourceIds = parseSourceIds(row.sourceIds);
  const replies = getRepliesByTicketId(row.id);

  return {
    id: row.id,
    title: row.title,
    question: row.question,
    answer: row.answer,
    category: row.category,
    priority: row.priority,
    department: row.department,
    sourceIds,
    sources: getSourcesByIds(sourceIds),
    status: row.status,
    allowedNextStatuses: getAllowedNextStatuses({
      status: row.status,
      customerFeedback: row.customerFeedback,
      replies,
    }),
    customerFeedback: row.customerFeedback,
    customerFeedbackAt: row.customerFeedbackAt,
    replies,
    followups: getFollowupsByTicketId(row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const createTicket = ({
  question,
  answer,
  category = "产品咨询",
  priority = "中",
  department = "客服支持团队",
  sourceIds = [],
  customerFeedback = null,
}) => {
  const now = new Date().toISOString();
  const normalizedFeedback = customerFeedbackValues.includes(customerFeedback) ? customerFeedback : null;
  const ticket = {
    id: createTicketId(),
    title: question.length > 24 ? `${question.slice(0, 24)}...` : question,
    question,
    answer: answer || "",
    category,
    priority,
    department,
    sourceIds,
    sources: getSourcesByIds(sourceIds),
    status: "待处理",
    customerFeedback: normalizedFeedback,
    customerFeedbackAt: normalizedFeedback ? now : null,
    replies: [],
    createdAt: now,
    updatedAt: null,
  };

  db.prepare(
    `INSERT INTO tickets (
      id,
      title,
      question,
      answer,
      category,
      priority,
      department,
      source_ids,
      status,
      customer_feedback,
      customer_feedback_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    ticket.id,
    ticket.title,
    ticket.question,
    ticket.answer,
    ticket.category,
    ticket.priority,
    ticket.department,
    JSON.stringify(ticket.sourceIds),
    ticket.status,
    ticket.customerFeedback,
    ticket.customerFeedbackAt,
    ticket.createdAt,
    ticket.updatedAt
  );

  if (ticket.customerFeedback) {
    insertCustomerFeedback({
      ticketId: ticket.id,
      question: ticket.question,
      answer: ticket.answer,
      feedback: ticket.customerFeedback,
      createdAt: ticket.customerFeedbackAt,
    });
  }

  return ticket;
};

export const getTickets = () =>
  db
    .prepare(
      `SELECT
        id,
        title,
        question,
        answer,
        category,
        priority,
        department,
        source_ids AS sourceIds,
        status,
        customer_feedback AS customerFeedback,
        customer_feedback_at AS customerFeedbackAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM tickets
      ORDER BY created_at DESC`
    )
    .all()
    .map(mapTicketRow);

export const getTicketById = (ticketId) =>
  mapTicketRow(
    db
      .prepare(
        `SELECT
          id,
          title,
          question,
          answer,
          category,
          priority,
          department,
          source_ids AS sourceIds,
          status,
          customer_feedback AS customerFeedback,
          customer_feedback_at AS customerFeedbackAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM tickets
        WHERE id = ?`
      )
      .get(ticketId)
  );

export const updateTicketStatus = (ticketId, status) => {
  if (!ticketStatuses.includes(status)) {
    return null;
  }

  const ticket = getTicketById(ticketId);
  if (!ticket) {
    return null;
  }

  if (!getAllowedNextStatuses(ticket).includes(status)) {
    return null;
  }

  db.prepare("UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?").run(
    status,
    new Date().toISOString(),
    ticketId
  );

  return getTicketById(ticketId);
};

const insertCustomerFeedback = ({ ticketId = null, question, answer, feedback, createdAt }) => {
  db.prepare(
    `INSERT INTO customer_feedback (id, ticket_id, question, answer, feedback, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    createFeedbackId(),
    ticketId,
    question || "",
    answer || "",
    feedback,
    createdAt
  );
};

export const recordCustomerFeedback = ({ ticketId = null, question = "", answer = "", feedback }) => {
  if (!customerFeedbackValues.includes(feedback)) {
    return null;
  }

  const now = new Date().toISOString();
  const ticket = ticketId ? getTicketById(ticketId) : null;

  insertCustomerFeedback({
    ticketId: ticket?.id || null,
    question: ticket?.question || question,
    answer: ticket?.answer || answer,
    feedback,
    createdAt: now,
  });

  if (!ticket) {
    return {
      customerFeedback: feedback,
      customerFeedbackAt: now,
      ticket: null,
    };
  }

  const nextStatus =
    feedback === "resolved" && ticket.status === "待客户确认"
      ? "已解决"
      : feedback === "unresolved" && ticket.status === "待客户确认"
        ? "处理中"
        : ticket.status;

  db.prepare(
    "UPDATE tickets SET customer_feedback = ?, customer_feedback_at = ?, status = ?, updated_at = ? WHERE id = ?"
  ).run(feedback, now, nextStatus, now, ticket.id);

  return {
    customerFeedback: feedback,
    customerFeedbackAt: now,
    ticket: getTicketById(ticket.id),
  };
};

export const addTicketReply = (ticketId, content) => {
  const ticket = getTicketById(ticketId);
  if (!ticket || !content.trim()) {
    return null;
  }

  const reply = {
    id: createReplyId(),
    author: "客服",
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO ticket_replies (id, ticket_id, author, content, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(reply.id, ticketId, reply.author, reply.content, reply.createdAt);

  const nextStatus = ["待处理", "处理中"].includes(ticket.status) ? "待客户确认" : ticket.status;
  db.prepare("UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?").run(
    nextStatus,
    new Date().toISOString(),
    ticketId
  );

  return getTicketById(ticketId);
};

export const addTicketFollowup = (ticketId, content) => {
  const ticket = getTicketById(ticketId);
  const trimmedContent = content.trim();

  if (!ticket || !trimmedContent || ticket.status !== "待客户确认") {
    return null;
  }

  const followup = {
    id: createFollowupId(),
    author: "客户",
    content: trimmedContent,
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO ticket_followups (id, ticket_id, author, content, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(followup.id, ticketId, followup.author, followup.content, followup.createdAt);

  db.prepare("UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?").run(
    "处理中",
    followup.createdAt,
    ticketId
  );

  return getTicketById(ticketId);
};

const buildFallbackReplyDraft = (ticket) => {
  const sourceTitle = ticket.sources?.[0]?.title ? `，我们参考了《${ticket.sources[0].title}》` : "";
  const latestFollowup = ticket.followups?.at(-1)?.content;

  return [
    "您好，关于您反馈的问题，我们已经收到。",
    latestFollowup ? `我们也看到了您补充的说明：“${latestFollowup}”。` : "",
    `根据您描述的情况${sourceTitle}，我们建议先按照上述说明进行核对。`,
    "如果核对后问题仍未解决，我们会继续协助排查，并在需要时同步技术或财务支持团队进一步确认。",
  ].filter(Boolean).join("\n");
};

export const getTicketReplyDraft = async (ticketId) => {
  const ticket = getTicketById(ticketId);

  if (!ticket) {
    return null;
  }

  const fallbackDraft = buildFallbackReplyDraft(ticket);

  try {
    const llmDraft = await generateSupportReplyDraft({ ticket });

    return {
      draft: llmDraft || fallbackDraft,
      draftMode: llmDraft ? "seed_2_0_pro" : "rule_fallback",
    };
  } catch (error) {
    console.warn(error.message);

    return {
      draft: fallbackDraft,
      draftMode: "rule_fallback",
    };
  }
};
