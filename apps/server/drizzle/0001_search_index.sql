-- Full-text index over people, organizations, facts, entries, custom field values
-- and contact points. Filled and kept in sync by the application (task 04).
-- `content` holds text normalized by the app (umlauts/accents folded, so
-- Müller = Mueller = Muller); remove_diacritics is a second safety net.
CREATE VIRTUAL TABLE `search_index` USING fts5(
	`entity_type` UNINDEXED,
	`entity_id` UNINDEXED,
	`space_id` UNINDEXED,
	`field` UNINDEXED,
	`content`,
	tokenize = 'unicode61 remove_diacritics 2'
);
