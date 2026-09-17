-- CreateTable
CREATE TABLE "MediaFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileFormat" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "duration" REAL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Transcription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mediaFileId" TEXT NOT NULL,
    "spokenLanguage" TEXT NOT NULL,
    "detectedLanguage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT,
    "errorMessage" TEXT,
    "processingStartedAt" DATETIME,
    "processingCompletedAt" DATETIME,
    "processingDuration" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transcription_mediaFileId_fkey" FOREIGN KEY ("mediaFileId") REFERENCES "MediaFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranscriptVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transcriptionId" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "fullText" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TranscriptVariant_transcriptionId_fkey" FOREIGN KEY ("transcriptionId") REFERENCES "Transcription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "startTime" REAL NOT NULL,
    "endTime" REAL NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Segment_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "TranscriptVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Caption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Caption_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "TranscriptVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MediaFile_uploadedAt_idx" ON "MediaFile"("uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transcription_mediaFileId_key" ON "Transcription"("mediaFileId");

-- CreateIndex
CREATE INDEX "Transcription_status_idx" ON "Transcription"("status");

-- CreateIndex
CREATE INDEX "Transcription_createdAt_idx" ON "Transcription"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptVariant_transcriptionId_script_key" ON "TranscriptVariant"("transcriptionId", "script");

-- CreateIndex
CREATE INDEX "Segment_variantId_index_idx" ON "Segment"("variantId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "Caption_variantId_format_key" ON "Caption"("variantId", "format");
