-- CreateTable
CREATE TABLE "SearchCache" (
    "key" TEXT NOT NULL,
    "cardIds" TEXT[],
    "hasMore" BOOLEAN NOT NULL DEFAULT false,
    "totalCards" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "SearchCache_updatedAt_idx" ON "SearchCache"("updatedAt");
