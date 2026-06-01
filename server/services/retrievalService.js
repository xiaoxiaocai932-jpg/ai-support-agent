import { getActiveKnowledgeItems } from "./knowledgeService.js";

const normalize = (text) => text.toLowerCase().replace(/\s+/g, "");

const getChineseNgrams = (text) => {
  const words = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  return words.flatMap((word) => {
    const terms = [];
    for (let index = 0; index < word.length - 1; index += 1) {
      terms.push(word.slice(index, index + 2));
    }
    return terms;
  });
};

const getQuestionTerms = (question) => {
  const normalized = normalize(question);
  return Array.from(
    new Set([
      ...getChineseNgrams(question),
      ...question.toLowerCase().match(/[a-z0-9]+/g) || [],
      normalized,
    ])
  ).filter((term) => term.length >= 2);
};

const scoreKnowledge = (item, terms) => {
  const haystack = normalize(
    `${item.title} ${item.category} ${item.tags.join(" ")} ${item.content}`
  );

  return terms.reduce((score, term) => {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) return score;

    if (item.tags.some((tag) => normalize(tag).includes(normalizedTerm))) {
      return score + 4;
    }

    if (normalize(item.title).includes(normalizedTerm)) {
      return score + 3;
    }

    if (haystack.includes(normalizedTerm)) {
      return score + 2;
    }

    return score;
  }, 0);
};

export const retrieveKnowledge = (question) => {
  const terms = getQuestionTerms(question);
  const rankedItems = getActiveKnowledgeItems()
    .map((item) => ({
      ...item,
      score: scoreKnowledge(item, terms),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const topScore = rankedItems[0]?.score || 0;
  const minimumRelevantScore = Math.max(4, topScore * 0.4);

  return rankedItems.filter((item) => item.score >= minimumRelevantScore).slice(0, 3);
};
