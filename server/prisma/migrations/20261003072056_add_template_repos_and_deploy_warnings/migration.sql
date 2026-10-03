-- AlterTable
ALTER TABLE "Stack" ADD COLUMN     "deployWarnings" TEXT,
ADD COLUMN     "templateCommitSha" TEXT,
ADD COLUMN     "templateContentHash" TEXT,
ADD COLUMN     "templatePath" TEXT,
ADD COLUMN     "templateRepoUrl" TEXT,
ADD COLUMN     "templateUpdateAvailable" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TemplateRepo" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "headCommitSha" TEXT,
    "lastSyncAttemptAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "syncIssues" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateRepo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "iconDataUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVariant" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "usage" TEXT,
    "composeContent" TEXT NOT NULL,
    "envContent" TEXT,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TemplateRepo_url_key" ON "TemplateRepo"("url");

-- CreateIndex
CREATE UNIQUE INDEX "Template_repoId_slug_key" ON "Template"("repoId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVariant_templateId_slug_key" ON "TemplateVariant"("templateId", "slug");

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "TemplateRepo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVariant" ADD CONSTRAINT "TemplateVariant_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

