import cors from "cors";
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { askAgent } from "./services/agentService.js";
import { getDashboardStats, recordAiInteraction } from "./services/dashboardService.js";
import {
  createKnowledgeItem,
  getKnowledgeCategories,
  getKnowledgeItems,
  updateKnowledgeItem,
} from "./services/knowledgeService.js";
import {
  addTicketFollowup,
  addTicketReply,
  createTicket,
  getTicketReplyDraft,
  getTicketById,
  getTickets,
  recordCustomerFeedback,
  updateTicketStatus,
} from "./services/ticketService.js";

const app = express();
const port = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, "../dist");

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/ask", (req, res) => {
  const question = String(req.body.question || "").trim();

  if (!question) {
    return res.status(400).json({ message: "问题不能为空" });
  }

  askAgent(question)
    .then((result) => {
      recordAiInteraction(result);
      return res.json(result);
    })
    .catch((error) => {
      console.error(error);
      return res.status(500).json({ message: "AI 问答失败" });
    });
});

app.get("/api/tickets/:id/reply-draft", (req, res) => {
  getTicketReplyDraft(req.params.id)
    .then((result) => {
      if (!result) {
        return res.status(404).json({ message: "工单不存在" });
      }

      return res.json(result);
    })
    .catch((error) => {
      console.error(error);
      return res.status(500).json({ message: "回复草稿生成失败" });
    });
});

app.get("/api/dashboard", (req, res) => {
  res.json(getDashboardStats());
});

app.get("/api/tickets", (req, res) => {
  res.json({ tickets: getTickets() });
});

app.get("/api/tickets/:id", (req, res) => {
  const ticket = getTicketById(req.params.id);

  if (!ticket) {
    return res.status(404).json({ message: "工单不存在" });
  }

  return res.json({ ticket });
});

app.post("/api/tickets", (req, res) => {
  const question = String(req.body.question || "").trim();

  if (!question) {
    return res.status(400).json({ message: "问题不能为空" });
  }

  const ticket = createTicket({
    question,
    answer: req.body.answer,
    category: req.body.category,
    priority: req.body.priority,
    department: req.body.department,
    sourceIds: req.body.sourceIds,
    customerFeedback: req.body.customerFeedback,
  });

  return res.status(201).json({ ticket });
});

app.post("/api/feedback", (req, res) => {
  const feedback = String(req.body.feedback || "").trim();
  const ticketId = req.body.ticketId ? String(req.body.ticketId).trim() : null;

  const result = recordCustomerFeedback({
    ticketId,
    question: String(req.body.question || "").trim(),
    answer: String(req.body.answer || "").trim(),
    feedback,
  });

  if (!result) {
    return res.status(400).json({ message: "反馈类型无效" });
  }

  return res.status(201).json(result);
});

app.get("/api/knowledge", (req, res) => {
  res.json({
    knowledge: getKnowledgeItems({
      category: String(req.query.category || "").trim(),
      status: String(req.query.status || "").trim(),
      query: String(req.query.query || "").trim(),
    }),
    categories: getKnowledgeCategories(),
  });
});

app.post("/api/knowledge", (req, res) => {
  const item = createKnowledgeItem({
    title: String(req.body.title || ""),
    category: String(req.body.category || ""),
    tags: req.body.tags,
    content: String(req.body.content || ""),
    enabled: req.body.enabled,
  });

  if (!item) {
    return res.status(400).json({ message: "知识标题、分类和正文不能为空" });
  }

  return res.status(201).json({ item });
});

app.patch("/api/knowledge/:id", (req, res) => {
  const item = updateKnowledgeItem(req.params.id, {
    title: req.body.title,
    category: req.body.category,
    tags: req.body.tags,
    content: req.body.content,
    enabled: req.body.enabled,
  });

  if (!item) {
    return res.status(404).json({ message: "知识不存在或内容无效" });
  }

  return res.json({ item });
});

app.patch("/api/tickets/:id/status", (req, res) => {
  const status = String(req.body.status || "").trim();
  const ticket = updateTicketStatus(req.params.id, status);

  if (!ticket) {
    return res.status(404).json({ message: "工单不存在或状态无效" });
  }

  return res.json({ ticket });
});

app.post("/api/tickets/:id/followups", (req, res) => {
  const content = String(req.body.content || "").trim();

  if (!content) {
    return res.status(400).json({ message: "补充内容不能为空" });
  }

  const ticket = addTicketFollowup(req.params.id, content);

  if (!ticket) {
    return res.status(404).json({ message: "工单不存在或当前状态不支持补充" });
  }

  return res.status(201).json({ ticket });
});

app.post("/api/tickets/:id/replies", (req, res) => {
  const content = String(req.body.content || "").trim();

  if (!content) {
    return res.status(400).json({ message: "回复内容不能为空" });
  }

  const ticket = addTicketReply(req.params.id, content);

  if (!ticket) {
    return res.status(404).json({ message: "工单不存在" });
  }

  return res.status(201).json({ ticket });
});

app.use(express.static(clientDistPath));

app.use((req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

app.listen(port, () => {
  console.log(`AI support agent server is running on http://localhost:${port}`);
});
