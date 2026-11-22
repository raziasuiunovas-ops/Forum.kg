-- Add discussion categories, topics, and threaded posts.
-- Topics and posts are soft-deleted by the API so their relationships remain intact.

CREATE TABLE "TopicCategory" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TopicCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Topic" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "content" JSONB NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Post" (
    "id" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "parentId" UUID,
    "content" JSONB NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TopicCategory_slug_key" ON "TopicCategory"("slug");
CREATE INDEX "TopicCategory_isActive_sortOrder_idx" ON "TopicCategory"("isActive", "sortOrder");

CREATE INDEX "Topic_deletedAt_createdAt_idx" ON "Topic"("deletedAt", "createdAt");
CREATE INDEX "Topic_categoryId_deletedAt_createdAt_idx" ON "Topic"("categoryId", "deletedAt", "createdAt");
CREATE INDEX "Topic_authorId_deletedAt_createdAt_idx" ON "Topic"("authorId", "deletedAt", "createdAt");
CREATE INDEX "Topic_isPinned_deletedAt_createdAt_idx" ON "Topic"("isPinned", "deletedAt", "createdAt");
CREATE INDEX "Topic_viewCount_deletedAt_idx" ON "Topic"("viewCount", "deletedAt");
CREATE INDEX "Topic_replyCount_deletedAt_idx" ON "Topic"("replyCount", "deletedAt");

CREATE INDEX "Post_topicId_deletedAt_createdAt_idx" ON "Post"("topicId", "deletedAt", "createdAt");
CREATE INDEX "Post_authorId_deletedAt_createdAt_idx" ON "Post"("authorId", "deletedAt", "createdAt");
CREATE INDEX "Post_parentId_createdAt_idx" ON "Post"("parentId", "createdAt");

ALTER TABLE "Topic"
    ADD CONSTRAINT "Topic_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TopicCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Topic_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Post"
    ADD CONSTRAINT "Post_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Post_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
