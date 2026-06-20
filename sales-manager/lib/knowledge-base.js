'use strict';

async function search(pool, query, limit = 4) {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3).slice(0, 6);
  if (!terms.length) return [];
  const conditions = terms.map((_, i) => `(LOWER(title) LIKE $${i+1} OR LOWER(content) LIKE $${i+1})`).join(' OR ');
  const params     = terms.map(t => `%${t}%`);
  const { rows }   = await pool.query(
    `SELECT title, content, category FROM knowledge_base WHERE ${conditions} LIMIT $${params.length + 1}`,
    [...params, limit]
  );
  return rows;
}

async function getCategory(pool, category) {
  const { rows } = await pool.query(
    `SELECT title, content FROM knowledge_base WHERE category = $1 ORDER BY title`,
    [category]
  );
  return rows;
}

function toPromptContext(entries) {
  if (!entries.length) return '(No relevant knowledge base articles found.)';
  return entries.map(e => `### ${e.title}\n${e.content}`).join('\n\n');
}

module.exports = { search, getCategory, toPromptContext };
