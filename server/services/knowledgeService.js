import { randomUUID } from "node:crypto";
import { knowledgeBase } from "../data/knowledgeBase.js";
import { db } from "./databaseService.js";

const createKnowledgeId = () => `kb-${Date.now().toString().slice(-8)}-${randomUUID().slice(0, 6)}`;

const parseTags = (value) => {
  try {
    const parsedValue = JSON.parse(value || "[]");
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
};

const normalizeTags = (tags) => {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  }

  return String(tags || "")
    .split(/[，,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const mapKnowledgeRow = (row) => {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    tags: parseTags(row.tags),
    content: row.content,
    enabled: Boolean(row.enabled),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const seedKnowledgeBase = () => {
  const count = db.prepare("SELECT COUNT(*) AS count FROM knowledge_items").get().count;

  if (count > 0) {
    return;
  }

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO knowledge_items (
      id, title, category, tags, content, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  knowledgeBase.forEach((item) => {
    insert.run(
      item.id,
      item.title,
      item.category,
      JSON.stringify(item.tags),
      item.content,
      1,
      now,
      now
    );
  });
};

seedKnowledgeBase();

export const getKnowledgeItems = ({ category = "", status = "", query = "" } = {}) => {
  const items = db
    .prepare(
      `SELECT
        id,
        title,
        category,
        tags,
        content,
        enabled,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM knowledge_items
      ORDER BY updated_at DESC`
    )
    .all()
    .map(mapKnowledgeRow);

  const normalizedQuery = query.trim().toLowerCase();

  return items.filter((item) => {
    const matchesCategory = !category || item.category === category;
    const matchesStatus =
      !status ||
      (status === "enabled" && item.enabled) ||
      (status === "disabled" && !item.enabled);
    const searchableText = `${item.title} ${item.category} ${item.tags.join(" ")} ${item.content}`.toLowerCase();
    const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);

    return matchesCategory && matchesStatus && matchesQuery;
  });
};

export const getActiveKnowledgeItems = () => getKnowledgeItems({ status: "enabled" });

export const getKnowledgeByIds = (knowledgeIds) => {
  if (!Array.isArray(knowledgeIds) || knowledgeIds.length === 0) {
    return [];
  }

  const rows = db
    .prepare(
      `SELECT
        id,
        title,
        category,
        tags,
        content,
        enabled,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM knowledge_items
      WHERE id = ?`
    );

  return knowledgeIds.map((id) => mapKnowledgeRow(rows.get(id))).filter(Boolean);
};

export const createKnowledgeItem = ({ title, category, tags, content, enabled = true }) => {
  const now = new Date().toISOString();
  const item = {
    id: createKnowledgeId(),
    title: title.trim(),
    category: category.trim(),
    tags: normalizeTags(tags),
    content: content.trim(),
    enabled: Boolean(enabled),
    createdAt: now,
    updatedAt: now,
  };

  if (!item.title || !item.category || !item.content) {
    return null;
  }

  db.prepare(
    `INSERT INTO knowledge_items (
      id, title, category, tags, content, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    item.id,
    item.title,
    item.category,
    JSON.stringify(item.tags),
    item.content,
    item.enabled ? 1 : 0,
    item.createdAt,
    item.updatedAt
  );

  return item;
};

export const updateKnowledgeItem = (knowledgeId, { title, category, tags, content, enabled }) => {
  const current = getKnowledgeByIds([knowledgeId])[0];

  if (!current) {
    return null;
  }

  const item = {
    ...current,
    title: String(title ?? current.title).trim(),
    category: String(category ?? current.category).trim(),
    tags: tags === undefined ? current.tags : normalizeTags(tags),
    content: String(content ?? current.content).trim(),
    enabled: enabled === undefined ? current.enabled : Boolean(enabled),
    updatedAt: new Date().toISOString(),
  };

  if (!item.title || !item.category || !item.content) {
    return null;
  }

  db.prepare(
    `UPDATE knowledge_items
     SET title = ?, category = ?, tags = ?, content = ?, enabled = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    item.title,
    item.category,
    JSON.stringify(item.tags),
    item.content,
    item.enabled ? 1 : 0,
    item.updatedAt,
    knowledgeId
  );

  return getKnowledgeByIds([knowledgeId])[0];
};

export const getKnowledgeCategories = () =>
  Array.from(new Set(getKnowledgeItems().map((item) => item.category))).sort();
