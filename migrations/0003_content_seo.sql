CREATE TABLE page_content (
 path TEXT PRIMARY KEY,
 draft_data TEXT NOT NULL,
 published_data TEXT,
 version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 published_at TEXT
);
CREATE TABLE seo_entries (
 key TEXT PRIMARY KEY,
 title TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT '',
 image TEXT NOT NULL DEFAULT '',
 noindex INTEGER NOT NULL DEFAULT 0 CHECK(noindex IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE course_redirects (
 slug TEXT PRIMARY KEY,
 course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER reserve_old_course_slug_insert BEFORE INSERT ON courses
WHEN EXISTS(SELECT 1 FROM course_redirects WHERE slug=NEW.slug AND course_id<>NEW.id)
BEGIN SELECT RAISE(ABORT,'Course URL is reserved by an existing redirect'); END;
CREATE TRIGGER reserve_old_course_slug_update BEFORE UPDATE OF slug ON courses
WHEN EXISTS(SELECT 1 FROM course_redirects WHERE slug=NEW.slug AND course_id<>NEW.id)
BEGIN SELECT RAISE(ABORT,'Course URL is reserved by an existing redirect'); END;
CREATE TRIGGER preserve_course_url AFTER UPDATE OF slug ON courses
WHEN OLD.slug<>NEW.slug
BEGIN
 INSERT INTO course_redirects(slug,course_id) VALUES(OLD.slug,NEW.id)
 ON CONFLICT(slug) DO UPDATE SET course_id=excluded.course_id;
END;
CREATE TRIGGER gallery_updated_insert AFTER INSERT ON gallery BEGIN
 UPDATE settings SET updated_at=CURRENT_TIMESTAMP WHERE id=1;
END;
CREATE TRIGGER gallery_updated_update AFTER UPDATE ON gallery BEGIN
 UPDATE settings SET updated_at=CURRENT_TIMESTAMP WHERE id=1;
END;
CREATE TRIGGER gallery_updated_delete AFTER DELETE ON gallery BEGIN
 UPDATE settings SET updated_at=CURRENT_TIMESTAMP WHERE id=1;
END;
