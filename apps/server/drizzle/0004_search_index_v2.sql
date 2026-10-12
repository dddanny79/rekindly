-- Search index, version 2 (task 04). The first version (0001) indexed single fields,
-- which cannot match a query whose words are spread over several fields
-- ("mueller köln einkauf": name, organization, role). Now there is one document per
-- person and organization with three weighted columns; the application writes the
-- folded text (Müller = Mueller = Muller), remove_diacritics is a second safety net.
-- `search_documents` (0003) maps the FTS rowid to the entity and keeps the original
-- texts for snippets.
DROP TABLE `search_index`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `search_index` USING fts5(
	`name`,
	`details`,
	`notes`,
	tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
-- Triggers queue every change that affects a search document; the search service
-- rebuilds the queued documents (after each write request and before each search).
CREATE TRIGGER `people_search_insert` AFTER INSERT ON `people` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER `contact_points_search_insert` AFTER INSERT ON `contact_points` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `affiliations_search_insert` AFTER INSERT ON `affiliations` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `facts_search_insert` AFTER INSERT ON `facts` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `addresses_search_insert` AFTER INSERT ON `addresses` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.person_id WHERE NEW.person_id IS NOT NULL;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization', NEW.organization_id WHERE NEW.organization_id IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `field_values_search_insert` AFTER INSERT ON `field_values` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.target_id;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization', NEW.target_id;
END;
--> statement-breakpoint
CREATE TRIGGER `organizations_search_insert` AFTER INSERT ON `organizations` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization_tree', NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER `person_tags_search_insert` AFTER INSERT ON `person_tags` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `entry_people_search_insert` AFTER INSERT ON `entry_people` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `people_search_update` AFTER UPDATE ON `people` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER `contact_points_search_update` AFTER UPDATE ON `contact_points` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.person_id;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `affiliations_search_update` AFTER UPDATE ON `affiliations` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.person_id;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `facts_search_update` AFTER UPDATE ON `facts` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.person_id;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `addresses_search_update` AFTER UPDATE ON `addresses` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.person_id WHERE OLD.person_id IS NOT NULL;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.person_id WHERE NEW.person_id IS NOT NULL;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization', OLD.organization_id WHERE OLD.organization_id IS NOT NULL;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization', NEW.organization_id WHERE NEW.organization_id IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `field_values_search_update` AFTER UPDATE ON `field_values` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.target_id;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization', OLD.target_id;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', NEW.target_id;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization', NEW.target_id;
END;
--> statement-breakpoint
CREATE TRIGGER `organizations_search_update` AFTER UPDATE ON `organizations` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization_tree', OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER `tags_search_update` AFTER UPDATE ON `tags` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'tag', NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER `field_definitions_search_update` AFTER UPDATE ON `field_definitions` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'field_definition', NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER `people_search_delete` AFTER DELETE ON `people` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER `contact_points_search_delete` AFTER DELETE ON `contact_points` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `affiliations_search_delete` AFTER DELETE ON `affiliations` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `facts_search_delete` AFTER DELETE ON `facts` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `addresses_search_delete` AFTER DELETE ON `addresses` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.person_id WHERE OLD.person_id IS NOT NULL;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization', OLD.organization_id WHERE OLD.organization_id IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `field_values_search_delete` AFTER DELETE ON `field_values` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.target_id;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization', OLD.target_id;
END;
--> statement-breakpoint
CREATE TRIGGER `organizations_search_delete` AFTER DELETE ON `organizations` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization_tree', OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER `person_tags_search_delete` AFTER DELETE ON `person_tags` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `entry_people_search_delete` AFTER DELETE ON `entry_people` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', OLD.person_id;
END;
--> statement-breakpoint
CREATE TRIGGER `entries_search_insert` AFTER INSERT ON `entries` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization', NEW.organization_id WHERE NEW.organization_id IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `entries_search_update` AFTER UPDATE ON `entries` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', `person_id` FROM `entry_people` WHERE `entry_id` = NEW.id;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization', OLD.organization_id WHERE OLD.organization_id IS NOT NULL;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization', NEW.organization_id WHERE NEW.organization_id IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `entries_search_delete` AFTER DELETE ON `entries` BEGIN
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', `person_id` FROM `entry_people` WHERE `entry_id` = OLD.id;
  INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization', OLD.organization_id WHERE OLD.organization_id IS NOT NULL;
END;
--> statement-breakpoint
-- Index everything that exists already.
INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'person', `id` FROM `people`;
--> statement-breakpoint
INSERT OR IGNORE INTO `search_queue` (`kind`, `entity_id`) SELECT 'organization', `id` FROM `organizations`;
