import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  BarChart3,
  CheckCircle2,
  CircleHelp,
  FileText,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  TicketCheck,
  TrendingUp,
  UserCheck,
  UserRound,
} from "lucide-react";
import "./styles.css";

const examples = [
  "如何给子账号开通管理员权限？",
  "发票信息填写错误怎么办？",
  "系统无法同步客户数据怎么处理？",
];

const askAgent = async (question) => {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) {
    throw new Error("问答请求失败");
  }

  return response.json();
};

const createTicket = async (result) => {
  const response = await fetch("/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: result.question,
      answer: result.answer,
      category: result.category,
      priority: result.priority,
      department: result.department,
      sourceIds: result.sources.map((source) => source.id),
      customerFeedback: result.customerFeedback,
    }),
  });

  if (!response.ok) {
    throw new Error("工单创建失败");
  }

  return response.json();
};

const submitCustomerFeedback = async ({ ticketId, question, answer, feedback }) => {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticketId, question, answer, feedback }),
  });

  if (!response.ok) {
    throw new Error("反馈提交失败");
  }

  return response.json();
};

const getTickets = async () => {
  const response = await fetch("/api/tickets");

  if (!response.ok) {
    throw new Error("工单列表获取失败");
  }

  return response.json();
};

const getTicket = async (ticketId) => {
  const response = await fetch(`/api/tickets/${ticketId}`);

  if (!response.ok) {
    throw new Error("工单详情获取失败");
  }

  return response.json();
};

const updateTicketStatus = async (ticketId, status) => {
  const response = await fetch(`/api/tickets/${ticketId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error("工单状态更新失败");
  }

  return response.json();
};

const sendTicketReply = async (ticketId, content) => {
  const response = await fetch(`/api/tickets/${ticketId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error("回复发送失败");
  }

  return response.json();
};

const sendTicketFollowup = async (ticketId, content) => {
  const response = await fetch(`/api/tickets/${ticketId}/followups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error("补充说明发送失败");
  }

  return response.json();
};

const getTicketReplyDraft = async (ticketId) => {
  const response = await fetch(`/api/tickets/${ticketId}/reply-draft`);

  if (!response.ok) {
    throw new Error("回复草稿生成失败");
  }

  return response.json();
};

const getKnowledge = async ({ category = "", status = "", query = "" } = {}) => {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (status) params.set("status", status);
  if (query) params.set("query", query);

  const response = await fetch(`/api/knowledge?${params.toString()}`);

  if (!response.ok) {
    throw new Error("知识库获取失败");
  }

  return response.json();
};

const createKnowledge = async (item) => {
  const response = await fetch("/api/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });

  if (!response.ok) {
    throw new Error("知识创建失败");
  }

  return response.json();
};

const updateKnowledge = async (itemId, item) => {
  const response = await fetch(`/api/knowledge/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });

  if (!response.ok) {
    throw new Error("知识更新失败");
  }

  return response.json();
};

const getDashboard = async () => {
  const response = await fetch("/api/dashboard");

  if (!response.ok) {
    throw new Error("数据看板获取失败");
  }

  return response.json();
};

const createUserMessage = (content) => ({
  id: crypto.randomUUID(),
  role: "user",
  content,
});

const createAssistantMessage = (result) => ({
  id: crypto.randomUUID(),
  role: "assistant",
  result,
  ticket: null,
  feedback: null,
});

const createTicketFollowupMessage = (ticket) => ({
  id: crypto.randomUUID(),
  role: "assistant",
  result: {
    answer: "已把你的补充说明同步给客服，工单已回到处理中。客服会基于最新说明继续跟进。",
    sources: [],
    shouldCreateTicket: false,
  },
  ticket,
  feedback: null,
});

const feedbackLabels = {
  resolved: "已解决",
  unresolved: "仍需帮助",
};

const ticketStatuses = ["待处理", "处理中", "待客户确认", "已解决", "已关闭"];

function SourceList({ sources }) {
  if (sources.length === 0) {
    return <p className="sourceEmpty">暂未找到可引用的知识内容。</p>;
  }

  return (
    <div className="sourceList">
      {sources.map((source) => (
        <details className="sourceDetail" key={source.id}>
          <summary>
            <FileText size={16} />
            {source.title}
          </summary>
          <p>{source.snippet}</p>
        </details>
      ))}
    </div>
  );
}

function AssistantMessage({
  message,
  isCreatingTicket,
  isSavingFeedback,
  isRefreshingTicket,
  onCreateTicket,
  onFeedback,
  onRefreshTicket,
}) {
  const { result, ticket, feedback } = message;
  const isAnswerMessage = Boolean(result.question);
  const needsHumanReview = Boolean(result.shouldCreateTicket);
  const shouldOfferTicket = feedback === "unresolved";
  const hasSupportReplies = ticket?.replies?.length > 0;
  const supportFeedback = ticket?.customerFeedback;
  const canConfirmSupportReply =
    hasSupportReplies && ticket.status !== "已关闭" && supportFeedback !== "resolved";

  return (
    <article className="messageRow assistantRow">
      <div className="avatar assistantAvatar">
        <Bot size={18} />
      </div>
      <div className="messageBubble assistantBubble">
        <div className="answerText">
          {result.answer.split("\n").filter(Boolean).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        {isAnswerMessage && <SourceList sources={result.sources} />}

        {needsHumanReview && !feedback && (
          <div className="humanReviewNotice">
            <CircleHelp size={16} />
            <span>这个问题可能需要人工确认。如果回答没有解决，请选择“仍需帮助”。</span>
          </div>
        )}

        {shouldOfferTicket && !ticket && (
          <div className="handoffBox">
            <CircleHelp size={18} />
            <div>
              <strong>提交工单给客服跟进</strong>
              <span>我们可以为你提交工单，由客服继续确认并回复处理结果。</span>
            </div>
          </div>
        )}

        {ticket && (
          <div className="ticketSuccess">
            <TicketCheck size={18} />
            <div>
              <strong>工单已提交</strong>
              <span>工单编号：{ticket.id}</span>
              <span>当前状态：{ticket.status}</span>
              {ticket.customerFeedback && <span>你的反馈：{feedbackLabels[ticket.customerFeedback]}</span>}
            </div>
          </div>
        )}

        {ticket?.replies?.length > 0 && (
          <div className="customerReplies">
            <strong>客服回复</strong>
            {ticket.replies.map((reply) => (
              <article key={reply.id}>
                <p>{reply.content}</p>
                <span>{reply.author} · {new Date(reply.createdAt).toLocaleString()}</span>
              </article>
            ))}
            <div className="replyFeedback">
              <span>本次客服回复是否解决了你的问题？</span>
              {canConfirmSupportReply ? (
                <div className="messageActions inlineActions">
                  <button type="button" onClick={() => onFeedback(message.id, "resolved")} disabled={isSavingFeedback}>
                    <CheckCircle2 size={16} />
                    已解决
                  </button>
                  <button type="button" onClick={() => onFeedback(message.id, "unresolved")} disabled={isSavingFeedback}>
                    仍需帮助
                  </button>
                </div>
              ) : (
                <span className="feedbackText">
                  {supportFeedback === "resolved" ? "已记录：客服回复已解决问题" : "已记录反馈"}
                </span>
              )}
            </div>
          </div>
        )}

        {ticket?.followups?.length > 0 && (
          <div className="customerFollowups">
            <strong>你的补充说明</strong>
            {ticket.followups.map((followup) => (
              <article key={followup.id}>
                <p>{followup.content}</p>
                <span>{new Date(followup.createdAt).toLocaleString()}</span>
              </article>
            ))}
          </div>
        )}

        {isAnswerMessage && <div className="messageActions">
          {!feedback && (
            <>
              <button type="button" onClick={() => onFeedback(message.id, "resolved")} disabled={isSavingFeedback}>
                <CheckCircle2 size={16} />
                已解决
              </button>
              <button type="button" onClick={() => onFeedback(message.id, "unresolved")} disabled={isSavingFeedback}>
                仍需帮助
              </button>
            </>
          )}

          {feedback === "resolved" && <span className="feedbackText">已记录：问题已解决</span>}
          {feedback === "unresolved" && <span className="feedbackText">已记录：仍需帮助</span>}

          {shouldOfferTicket && !ticket && (
            <button
              className="ticketButton"
              type="button"
              onClick={() => onCreateTicket(message.id)}
              disabled={isCreatingTicket}
            >
              {isCreatingTicket ? <Loader2 className="spin" size={16} /> : <TicketCheck size={16} />}
              确认提交工单
            </button>
          )}

          {ticket && (
            <button type="button" onClick={() => onRefreshTicket(message.id)} disabled={isRefreshingTicket}>
              {isRefreshingTicket ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              刷新处理进展
            </button>
          )}
        </div>}
      </div>
    </article>
  );
}

function App() {
  if (window.location.pathname.startsWith("/workspace")) {
    return <WorkspaceApp />;
  }

  if (window.location.pathname.startsWith("/knowledge")) {
    return <KnowledgeApp />;
  }

  if (window.location.pathname.startsWith("/dashboard")) {
    return <DashboardApp />;
  }

  return <HelpCenterApp />;
}

function HelpCenterApp() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      result: {
        answer:
          "你好，我是智能客服助手。你可以直接描述遇到的问题，我会先从帮助文档中查找答案；如果问题需要人工处理，我会引导你提交工单。",
        sources: [],
        shouldCreateTicket: false,
      },
      ticket: null,
      feedback: null,
    },
  ]);
  const [isAsking, setIsAsking] = useState(false);
  const [creatingTicketFor, setCreatingTicketFor] = useState("");
  const [savingFeedbackFor, setSavingFeedbackFor] = useState("");
  const [refreshingTicketFor, setRefreshingTicketFor] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isAsking, [input, isAsking]);

  const getPendingConfirmationMessage = () =>
    [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          message.ticket?.status === "待客户确认" &&
          message.ticket?.replies?.length > 0 &&
          message.ticket?.customerFeedback !== "resolved"
      );

  const submitQuestion = async (question) => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isAsking) return;

    const pendingConfirmationMessage = getPendingConfirmationMessage();

    setInput("");
    setError("");
    setIsAsking(true);
    setMessages((currentMessages) => [...currentMessages, createUserMessage(trimmedQuestion)]);

    try {
      if (pendingConfirmationMessage?.ticket?.id) {
        const data = await sendTicketFollowup(pendingConfirmationMessage.ticket.id, trimmedQuestion);
        updateAssistantMessage(pendingConfirmationMessage.id, (message) => ({ ...message, ticket: data.ticket }));
        setMessages((currentMessages) => [...currentMessages, createTicketFollowupMessage(data.ticket)]);
        return;
      }

      const result = await askAgent(trimmedQuestion);
      setMessages((currentMessages) => [...currentMessages, createAssistantMessage(result)]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsAsking(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    submitQuestion(input);
  };

  const handleExampleClick = (example) => {
    submitQuestion(example);
  };

  const updateAssistantMessage = (messageId, updater) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (message.id !== messageId || message.role !== "assistant") {
          return message;
        }

        return updater(message);
      })
    );
  };

  const handleFeedback = async (messageId, feedback) => {
    const targetMessage = messages.find((message) => message.id === messageId);
    if (!targetMessage?.result?.question) return;

    setSavingFeedbackFor(messageId);
    setError("");

    try {
      const data = await submitCustomerFeedback({
        ticketId: targetMessage.ticket?.id,
        question: targetMessage.result.question,
        answer: targetMessage.result.answer,
        feedback,
      });
      updateAssistantMessage(messageId, (message) => ({
        ...message,
        feedback: data.customerFeedback,
        ticket: data.ticket || message.ticket,
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingFeedbackFor("");
    }
  };

  const handleCreateTicket = async (messageId) => {
    const targetMessage = messages.find((message) => message.id === messageId);
    if (!targetMessage?.result) return;

    setCreatingTicketFor(messageId);
    setError("");

    try {
      const data = await createTicket({
        ...targetMessage.result,
        customerFeedback: targetMessage.feedback,
      });
      updateAssistantMessage(messageId, (message) => ({ ...message, ticket: data.ticket }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCreatingTicketFor("");
    }
  };

  const handleRefreshTicket = async (messageId) => {
    const targetMessage = messages.find((message) => message.id === messageId);
    if (!targetMessage?.ticket?.id) return;

    setRefreshingTicketFor(messageId);
    setError("");

    try {
      const data = await getTicket(targetMessage.ticket.id);
      updateAssistantMessage(messageId, (message) => ({ ...message, ticket: data.ticket }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRefreshingTicketFor("");
    }
  };

  return (
    <main className="helpCenterShell">
      <section className="supportHeader">
        <div>
          <div className="eyebrow">
            <MessageCircle size={18} />
            帮助中心
          </div>
          <h1>智能客服</h1>
          <p>描述你遇到的问题，我会先查找帮助文档并给出处理建议。</p>
        </div>
      </section>

      <section className="chatPanel" aria-label="智能客服对话">
        <div className="chatMessages">
          {messages.map((message) =>
            message.role === "user" ? (
              <article className="messageRow userRow" key={message.id}>
                <div className="messageBubble userBubble">{message.content}</div>
                <div className="avatar userAvatar">
                  <UserRound size={18} />
                </div>
              </article>
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                isCreatingTicket={creatingTicketFor === message.id}
                isSavingFeedback={savingFeedbackFor === message.id}
                isRefreshingTicket={refreshingTicketFor === message.id}
                onCreateTicket={handleCreateTicket}
                onFeedback={handleFeedback}
                onRefreshTicket={handleRefreshTicket}
              />
            )
          )}

          {isAsking && (
            <article className="messageRow assistantRow">
              <div className="avatar assistantAvatar">
                <Bot size={18} />
              </div>
              <div className="messageBubble assistantBubble loadingBubble">
                <Loader2 className="spin" size={18} />
                正在查找相关帮助文档...
              </div>
            </article>
          )}
        </div>

        <div className="quickQuestions" aria-label="常见问题">
          {examples.map((example) => (
            <button key={example} type="button" onClick={() => handleExampleClick(example)} disabled={isAsking}>
              {example}
            </button>
          ))}
        </div>

        <form className="chatInputBar" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="输入你的问题"
            aria-label="输入你的问题"
          />
          <button type="submit" disabled={!canSend}>
            {isAsking ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            发送
          </button>
        </form>

        {error && <div className="errorMessage">{error}</div>}
      </section>
    </main>
  );
}

const emptyKnowledgeForm = {
  id: "",
  title: "",
  category: "产品咨询",
  tags: "",
  content: "",
  enabled: true,
};

const createKnowledgeForm = (item = emptyKnowledgeForm) => ({
  id: item.id || "",
  title: item.title || "",
  category: item.category || "产品咨询",
  tags: Array.isArray(item.tags) ? item.tags.join("，") : item.tags || "",
  content: item.content || "",
  enabled: item.enabled ?? true,
});

function KnowledgeApp() {
  const [knowledge, setKnowledge] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(createKnowledgeForm());
  const [filters, setFilters] = useState({ category: "", status: "", query: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedItem = useMemo(
    () => knowledge.find((item) => item.id === selectedId) || null,
    [knowledge, selectedId]
  );

  const loadKnowledge = async (nextFilters = filters) => {
    setError("");
    setIsLoading(true);

    try {
      const data = await getKnowledge(nextFilters);
      setKnowledge(data.knowledge);
      setCategories(data.categories);
      setSelectedId((currentId) => {
        if (currentId && data.knowledge.some((item) => item.id === currentId)) {
          return currentId;
        }
        return data.knowledge[0]?.id || "";
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadKnowledge();
  }, []);

  useEffect(() => {
    if (selectedItem) {
      setForm(createKnowledgeForm(selectedItem));
    }
  }, [selectedItem]);

  const handleFilterChange = (field, value) => {
    const nextFilters = { ...filters, [field]: value };
    setFilters(nextFilters);
    loadKnowledge(nextFilters);
  };

  const handleNewKnowledge = () => {
    setSelectedId("");
    setForm(createKnowledgeForm());
  };

  const handleFormChange = (field, value) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const handleSaveKnowledge = async () => {
    setIsSaving(true);
    setError("");

    const payload = {
      title: form.title,
      category: form.category,
      tags: form.tags,
      content: form.content,
      enabled: form.enabled,
    };

    try {
      const data = form.id
        ? await updateKnowledge(form.id, payload)
        : await createKnowledge(payload);
      await loadKnowledge(filters);
      setSelectedId(data.item.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleKnowledgeStatus = async (item) => {
    setError("");

    try {
      const data = await updateKnowledge(item.id, { enabled: !item.enabled });
      setKnowledge((currentKnowledge) =>
        currentKnowledge.map((currentItem) => (currentItem.id === data.item.id ? data.item : currentItem))
      );
      if (selectedId === data.item.id) {
        setForm(createKnowledgeForm(data.item));
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const canSave = form.title.trim() && form.category.trim() && form.content.trim() && !isSaving;

  return (
    <main className="knowledgeShell">
      <header className="workspaceHeader">
        <div>
          <div className="eyebrow">
            <FileText size={18} />
            知识库后台
          </div>
          <h1>知识管理</h1>
          <p>维护 AI 回答可引用的企业知识，控制哪些内容可被检索使用。</p>
        </div>
        <div className="headerActions">
          <a className="headerLink" href="/">客户侧</a>
          <a className="headerLink" href="/workspace">客服工作台</a>
        </div>
      </header>

      <section className="knowledgeWorkspace">
        <aside className="knowledgeListPanel">
          <div className="panelTitle">
            <strong>知识列表</strong>
            <button type="button" onClick={handleNewKnowledge}>
              <Plus size={16} />
              新增
            </button>
          </div>

          <div className="knowledgeFilters">
            <label>
              <Search size={16} />
              <input
                value={filters.query}
                onChange={(event) => handleFilterChange("query", event.target.value)}
                placeholder="搜索标题、标签、正文"
              />
            </label>
            <select value={filters.category} onChange={(event) => handleFilterChange("category", event.target.value)}>
              <option value="">全部分类</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <select value={filters.status} onChange={(event) => handleFilterChange("status", event.target.value)}>
              <option value="">全部状态</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </div>

          {isLoading && <div className="emptyPanel">正在加载知识...</div>}
          {!isLoading && knowledge.length === 0 && <div className="emptyPanel">暂无匹配知识。</div>}

          <div className="knowledgeList">
            {knowledge.map((item) => (
              <button
                className={`knowledgeListItem ${selectedId === item.id ? "active" : ""}`}
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
              >
                <span>{item.title}</span>
                <small>{item.category} · {item.enabled ? "可检索" : "已停用"}</small>
                <div>
                  {item.tags.slice(0, 3).map((tag) => <em key={tag}>{tag}</em>)}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="knowledgeEditorPanel">
          <div className="detailHeader">
            <div>
              <span className="sectionLabel">{form.id ? "编辑知识" : "新增知识"}</span>
              <h2>{form.title || "未命名知识"}</h2>
            </div>
            <span className={`knowledgeStatus ${form.enabled ? "enabled" : "disabled"}`}>
              {form.enabled ? "启用" : "停用"}
            </span>
          </div>

          <div className="knowledgeForm">
            <label>
              <span>知识标题</span>
              <input
                value={form.title}
                onChange={(event) => handleFormChange("title", event.target.value)}
                placeholder="例如：发票与合同处理规则"
              />
            </label>
            <label>
              <span>分类</span>
              <input
                value={form.category}
                onChange={(event) => handleFormChange("category", event.target.value)}
                placeholder="例如：计费与合同"
              />
            </label>
            <label>
              <span>标签</span>
              <input
                value={form.tags}
                onChange={(event) => handleFormChange("tags", event.target.value)}
                placeholder="用逗号分隔，例如：发票，合同，付款"
              />
            </label>
            <label className="knowledgeContentField">
              <span>知识正文</span>
              <textarea
                value={form.content}
                onChange={(event) => handleFormChange("content", event.target.value)}
                rows={9}
                placeholder="填写可被 AI 引用的规则、步骤或处理说明"
              />
            </label>
            <label className="toggleRow">
              <input
                checked={form.enabled}
                onChange={(event) => handleFormChange("enabled", event.target.checked)}
                type="checkbox"
              />
              <span>允许 AI 检索并引用这条知识</span>
            </label>
          </div>

          <div className="knowledgeEditorActions">
            {form.id && (
              <button type="button" onClick={() => selectedItem && toggleKnowledgeStatus(selectedItem)}>
                {form.enabled ? "停用知识" : "启用知识"}
              </button>
            )}
            <button className="primaryAction" type="button" onClick={handleSaveKnowledge} disabled={!canSave}>
              {isSaving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
              保存知识
            </button>
          </div>
        </section>

        <aside className="knowledgeGuidePanel">
          <div className="assistCard">
            <span className="sectionLabel">使用提示</span>
            <p>知识标题要让运营能快速识别内容，正文要写成 AI 可以直接引用的规则或步骤。</p>
          </div>
          <div className="assistCard">
            <span className="sectionLabel">后台说明</span>
            <p>停用后的知识不会参与客户侧 AI 问答，适合处理过期规则或错误说明。</p>
          </div>
          <div className="assistCard">
            <span className="sectionLabel">优化提示</span>
            <p>数据看板会基于“仍需帮助”的问题，帮助运营发现需要补充或改写的知识。</p>
          </div>
        </aside>
      </section>

      {error && <div className="workspaceError">{error}</div>}
    </main>
  );
}

const metricLabels = {
  totalConsultations: "总咨询量",
  aiResolutionRate: "AI 解决率",
  handoffRate: "转人工率",
  knowledgeHitRate: "知识命中率",
  ticketCount: "工单数量",
  feedbackCount: "反馈数量",
  enabledKnowledgeCount: "启用知识",
  disabledKnowledgeCount: "停用知识",
};

const metricDescriptions = {
  totalConsultations: "记录到系统的客户咨询次数",
  aiResolutionRate: "客户反馈已解决占全部反馈的比例",
  handoffRate: "进入人工工单的咨询占比",
  knowledgeHitRate: "AI 回答命中知识库的比例",
  ticketCount: "当前累计生成的工单数",
  feedbackCount: "客户提交的有效反馈数",
  enabledKnowledgeCount: "可被 AI 检索引用的知识数",
  disabledKnowledgeCount: "已从 AI 检索范围移除的知识数",
};

function DistributionBlock({ title, items }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="dashboardPanel">
      <div className="panelTitle">
        <strong>{title}</strong>
        <span>{total} 条</span>
      </div>
      <div className="distributionList">
        {items.length === 0 || total === 0 ? (
          <div className="emptyPanel">暂无数据。</div>
        ) : (
          items.map((item) => {
            const width = `${Math.max(6, Math.round((item.count / total) * 100))}%`;
            return (
              <article className="distributionItem" key={item.name}>
                <div>
                  <span>{item.name}</span>
                  <strong>{item.count}</strong>
                </div>
                <div className="barTrack">
                  <span style={{ width }} />
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function DashboardApp() {
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    setError("");
    setIsLoading(true);

    try {
      setDashboard(await getDashboard());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const metrics = dashboard?.metrics || {};
  const metricKeys = [
    "totalConsultations",
    "aiResolutionRate",
    "handoffRate",
    "knowledgeHitRate",
    "ticketCount",
    "feedbackCount",
    "enabledKnowledgeCount",
    "disabledKnowledgeCount",
  ];

  return (
    <main className="dashboardShell">
      <header className="workspaceHeader">
        <div>
          <div className="eyebrow">
            <BarChart3 size={18} />
            数据看板
          </div>
          <h1>AI 服务效果</h1>
          <p>用咨询、反馈、工单和知识库数据判断 AI 客服是否真正提升效率。</p>
        </div>
        <div className="headerActions">
          <a className="headerLink" href="/">客户侧</a>
          <a className="headerLink" href="/workspace">客服工作台</a>
          <a className="headerLink" href="/knowledge">知识库</a>
        </div>
      </header>

      {isLoading ? (
        <section className="dashboardWorkspace">
          <div className="emptyPanel">正在加载数据看板...</div>
        </section>
      ) : (
        <section className="dashboardWorkspace">
          <div className="metricGrid">
            {metricKeys.map((key) => {
              const isRate = key.includes("Rate");
              const value = metrics[key] ?? 0;
              return (
                <article className="metricCard" key={key}>
                  <span>{metricLabels[key]}</span>
                  <strong>{isRate ? `${value}%` : value}</strong>
                  <small>{metricDescriptions[key]}</small>
                </article>
              );
            })}
          </div>

          <div className="dashboardGrid">
            <DistributionBlock title="客户反馈分布" items={dashboard?.feedbackDistribution || []} />
            <DistributionBlock title="工单状态分布" items={dashboard?.ticketStatusDistribution || []} />
            <DistributionBlock title="问题分类分布" items={dashboard?.categoryDistribution || []} />
            <DistributionBlock title="知识状态分布" items={dashboard?.knowledgeStatusDistribution || []} />
          </div>

          <section className="dashboardPanel">
            <div className="panelTitle">
              <strong>近期仍需帮助问题</strong>
              <span>指导知识库优化</span>
            </div>
            <div className="unresolvedList">
              {dashboard?.recentUnresolved?.length > 0 ? (
                dashboard.recentUnresolved.map((item) => (
                  <article key={`${item.question}-${item.createdAt}`}>
                    <TrendingUp size={16} />
                    <div>
                      <strong>{item.question}</strong>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="emptyPanel">暂无仍需帮助反馈。</div>
              )}
            </div>
          </section>
        </section>
      )}

      {error && <div className="workspaceError">{error}</div>}
    </main>
  );
}

function WorkspaceApp() {
  const [tickets, setTickets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyDraftModes, setReplyDraftModes] = useState({});
  const [draftLoadingTickets, setDraftLoadingTickets] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [error, setError] = useState("");

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || tickets[0],
    [tickets, selectedTicketId]
  );

  const loadTickets = async () => {
    setError("");
    setIsLoading(true);

    try {
      const data = await getTickets();
      setTickets(data.tickets);
      setSelectedTicketId((currentId) => currentId || data.tickets[0]?.id || "");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  useEffect(() => {
    if (!selectedTicket || replyDrafts[selectedTicket.id]) return;

    const loadReplyDraft = async () => {
      setDraftLoadingTickets((currentLoadingTickets) => ({
        ...currentLoadingTickets,
        [selectedTicket.id]: true,
      }));

      try {
        const data = await getTicketReplyDraft(selectedTicket.id);
        setReplyDrafts((currentDrafts) => ({
          ...currentDrafts,
          [selectedTicket.id]: data.draft,
        }));
        setReplyDraftModes((currentModes) => ({
          ...currentModes,
          [selectedTicket.id]: data.draftMode,
        }));
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setDraftLoadingTickets((currentLoadingTickets) => ({
          ...currentLoadingTickets,
          [selectedTicket.id]: false,
        }));
      }
    };

    loadReplyDraft();
  }, [selectedTicket, replyDrafts]);

  const handleStatusChange = async (status) => {
    if (!selectedTicket) return;

    setIsUpdating(true);
    setError("");

    try {
      const data = await updateTicketStatus(selectedTicket.id, status);
      setTickets((currentTickets) =>
        currentTickets.map((ticket) => (ticket.id === data.ticket.id ? data.ticket : ticket))
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReplyDraftChange = (ticketId, value) => {
    setReplyDrafts((currentDrafts) => ({ ...currentDrafts, [ticketId]: value }));
  };

  const handleSendReply = async () => {
    if (!selectedTicket) return;

    const content = replyDrafts[selectedTicket.id] || "";
    setIsSendingReply(true);
    setError("");

    try {
      const data = await sendTicketReply(selectedTicket.id, content);
      setTickets((currentTickets) =>
        currentTickets.map((ticket) => (ticket.id === data.ticket.id ? data.ticket : ticket))
      );
      setReplyDrafts((currentDrafts) => ({
        ...currentDrafts,
        [selectedTicket.id]: "",
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSendingReply(false);
    }
  };

  return (
    <main className="workspaceShell">
      <header className="workspaceHeader">
        <div>
          <div className="eyebrow">
            <UserCheck size={18} />
            客服工作台
          </div>
          <h1>工单处理</h1>
          <p>查看客户问题、AI 辅助判断、引用知识，并推进工单状态。</p>
        </div>
        <a className="headerLink" href="/">返回客户侧</a>
      </header>

      <section className="agentWorkspace">
        <aside className="ticketListPanel">
          <div className="panelTitle">
            <strong>工单列表</strong>
            <button type="button" onClick={loadTickets} disabled={isLoading}>刷新</button>
          </div>

          {isLoading && <div className="emptyPanel">正在加载工单...</div>}

          {!isLoading && tickets.length === 0 && (
            <div className="emptyPanel">
              暂无工单。请先在客户侧智能客服中提交一个工单。
            </div>
          )}

          <div className="ticketList">
            {tickets.map((ticket) => (
              <button
                className={`ticketListItem ${selectedTicket?.id === ticket.id ? "active" : ""}`}
                key={ticket.id}
                type="button"
                onClick={() => setSelectedTicketId(ticket.id)}
              >
                <span>{ticket.title}</span>
                <small>{ticket.status} · {ticket.priority}优先级</small>
                {ticket.customerFeedback && (
                  <small>客户反馈：{feedbackLabels[ticket.customerFeedback]}</small>
                )}
              </button>
            ))}
          </div>
        </aside>

        <section className="ticketDetailPanel">
          {!selectedTicket ? (
            <div className="emptyPanel">选择左侧工单查看详情。</div>
          ) : (
            <>
              <div className="detailHeader">
                <div>
                  <span className="ticketId">{selectedTicket.id}</span>
                  <h2>{selectedTicket.title}</h2>
                </div>
                <span className={`statusBadge status${selectedTicket.status}`}>{selectedTicket.status}</span>
              </div>

              <div className="conversationBlock">
                <span className="sectionLabel">客户原始问题</span>
                <p>{selectedTicket.question}</p>
              </div>

              <div className="conversationBlock">
                <span className="sectionLabel">客户反馈</span>
                {selectedTicket.customerFeedback ? (
                  <p>
                    {feedbackLabels[selectedTicket.customerFeedback]} · {new Date(selectedTicket.customerFeedbackAt).toLocaleString()}
                  </p>
                ) : (
                  <p>客户暂未反馈 AI 回答是否解决问题。</p>
                )}
              </div>

              <div className="conversationBlock">
                <span className="sectionLabel">客户补充说明</span>
                {selectedTicket.followups?.length > 0 ? (
                  <div className="replyList">
                    {selectedTicket.followups.map((followup) => (
                      <article key={followup.id}>
                        <p>{followup.content}</p>
                        <span>{followup.author} · {new Date(followup.createdAt).toLocaleString()}</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>暂无客户补充说明。</p>
                )}
              </div>

              <div className="conversationBlock">
                <span className="sectionLabel">AI 已回复内容</span>
                {selectedTicket.answer.split("\n").filter(Boolean).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>

              <div className="conversationBlock">
                <span className="sectionLabel">回复记录</span>
                {selectedTicket.replies?.length > 0 ? (
                  <div className="replyList">
                    {selectedTicket.replies.map((reply) => (
                      <article key={reply.id}>
                        <p>{reply.content}</p>
                        <span>{reply.author} · {new Date(reply.createdAt).toLocaleString()}</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>暂无客服回复。</p>
                )}
              </div>

              <div className="replyComposer">
                <div className="panelTitle">
                  <strong>回复客户</strong>
                  <span>
                    {replyDraftModes[selectedTicket.id] === "seed_2_0_pro"
                      ? "Seed 2.0 Pro 已生成草稿，发送前请人工确认。"
                      : "AI 已生成草稿，发送前请人工确认。"}
                  </span>
                </div>
                <textarea
                  value={replyDrafts[selectedTicket.id] || ""}
                  onChange={(event) => handleReplyDraftChange(selectedTicket.id, event.target.value)}
                  rows={6}
                  placeholder={draftLoadingTickets[selectedTicket.id] ? "正在生成回复草稿..." : "输入回复内容"}
                />
                <button type="button" onClick={handleSendReply} disabled={isSendingReply || !(replyDrafts[selectedTicket.id] || "").trim()}>
                  {isSendingReply ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                  发送回复
                </button>
              </div>

              <div className="statusActions">
                {ticketStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={
                      isUpdating ||
                      selectedTicket.status === status ||
                      !selectedTicket.allowedNextStatuses?.includes(status)
                    }
                    onClick={() => handleStatusChange(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="aiAssistPanel">
          {!selectedTicket ? (
            <div className="emptyPanel">暂无 AI 辅助信息。</div>
          ) : (
            <>
              <div className="assistCard">
                <span className="sectionLabel">AI 辅助判断</span>
                <dl>
                  <div>
                    <dt>问题分类</dt>
                    <dd>{selectedTicket.category}</dd>
                  </div>
                  <div>
                    <dt>优先级</dt>
                    <dd>{selectedTicket.priority}</dd>
                  </div>
                  <div>
                    <dt>建议负责团队</dt>
                    <dd>{selectedTicket.department}</dd>
                  </div>
                  <div>
                    <dt>客户反馈</dt>
                    <dd>{selectedTicket.customerFeedback ? feedbackLabels[selectedTicket.customerFeedback] : "暂无"}</dd>
                  </div>
                </dl>
              </div>

              <div className="assistCard">
                <span className="sectionLabel">AI 问题总结</span>
                <p>
                  客户咨询“{selectedTicket.question}”。AI 已基于知识库生成初步答复
                  {selectedTicket.followups?.length > 0 ? "，客户已补充新的问题说明，建议优先结合补充内容继续跟进。" : "，建议客服结合引用知识继续确认客户实际情况。"}
                </p>
              </div>

              <div className="assistCard">
                <span className="sectionLabel">引用知识</span>
                {selectedTicket.sources?.length > 0 ? (
                  selectedTicket.sources.map((source) => (
                    <article className="workspaceSource" key={source.id}>
                      <strong>{source.title}</strong>
                      <small>{source.category}</small>
                      <p>{source.content}</p>
                    </article>
                  ))
                ) : (
                  <p>暂无引用知识，建议客服人工确认并补充知识库。</p>
                )}
              </div>
            </>
          )}
        </aside>
      </section>

      {error && <div className="workspaceError">{error}</div>}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
